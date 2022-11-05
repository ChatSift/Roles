import type { Prompt } from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import { EmbedLimits, TextInputLimits } from '@sapphire/discord-utilities';
import type {
	MessageActionRowComponentBuilder,
	ChatInputCommandInteraction,
	ButtonInteraction,
	ModalActionRowComponentBuilder,
	StringSelectMenuInteraction,
	HexColorString,
	RoleSelectMenuInteraction,
} from 'discord.js';
import {
	RoleSelectMenuBuilder,
	EmbedBuilder,
	TextInputBuilder,
	TextInputStyle,
	ModalBuilder,
	ButtonStyle,
	ApplicationCommandType,
	ActionRowBuilder,
	ButtonBuilder,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
} from 'discord.js';
import { singleton } from 'tsyringe';
import type { Command, CommandBody } from '../struct/Command';
import { awaitModalSubmitOrNull } from '../util/awaitModalSubmitOrNull';
import { filterEmptyActionRows } from '../util/filterEmptyActionRows';
import { getModalTextInputValue } from '../util/getModalTextInputValue';

type PromptData = {
	color: string | null;
	description: string | null;
	imageUrl: string | null;
	title: string;
	useButtons: boolean | null;
};

type State = {
	locked: boolean;
	prompts: Prompt[];
	selected: Prompt | null;
};

@singleton()
export default class implements Command<ApplicationCommandType.ChatInput> {
	public readonly interactionOptions: CommandBody<ApplicationCommandType.ChatInput> = {
		name: 'setup',
		description: 'Setup the bot',
		type: ApplicationCommandType.ChatInput,
		default_member_permissions: '0',
		dm_permission: false,
		options: [],
	};

	public constructor(private readonly prisma: PrismaClient) {}

	private resolveMessageContent(prompts: Prompt[]): string {
		if (!prompts.length) {
			return 'You don\'t seem to have any prompts yet. Use the "Create a prompt" button to create one.';
		}

		if (prompts.length >= 25) {
			return 'Select a specific prompt from the dropdown to manage it. You have too many prompts to create new ones.';
		}

		return 'Select a specific prompt from the dropdown to manage it or use the "Create a prompt" button to create a new one.';
	}

	private async handlePromptDataCollection(
		parentInteraction: ButtonInteraction<'cached'>,
		existingData?: PromptData,
	): Promise<PromptData | null> {
		const titleInput = new TextInputBuilder()
			.setCustomId('title')
			.setLabel('Title')
			.setPlaceholder('Title to use in the embed prompt')
			.setRequired(true)
			.setStyle(TextInputStyle.Short)
			.setMaxLength(EmbedLimits.MaximumTitleLength);

		if (existingData?.title) {
			titleInput.setValue(existingData.title);
		}

		const descriptionInput = new TextInputBuilder()
			.setCustomId('description')
			.setLabel('Optional description')
			.setPlaceholder('Description to use in the embed prompt')
			.setRequired(false)
			.setStyle(TextInputStyle.Paragraph)
			.setMaxLength(Math.min(EmbedLimits.MaximumDescriptionLength, TextInputLimits.MaximumValueCharacters));

		if (existingData?.description) {
			descriptionInput.setValue(existingData.description);
		}

		const imageUrlInput = new TextInputBuilder()
			.setCustomId('image-url')
			.setLabel('Optional image URL')
			.setPlaceholder('Image to use in the embed prompt')
			.setRequired(false)
			.setStyle(TextInputStyle.Short);

		if (existingData?.imageUrl) {
			imageUrlInput.setValue(existingData.imageUrl);
		}

		const colorInput = new TextInputBuilder()
			.setCustomId('color')
			.setLabel('Optional embed color')
			.setPlaceholder('Color to use in the embed prompt')
			.setRequired(false)
			.setStyle(TextInputStyle.Short);

		if (existingData?.color) {
			colorInput.setValue(existingData.color);
		}

		const useButtonsInput = new TextInputBuilder()
			.setCustomId('use-buttons')
			.setLabel('Use buttons? (yes/no)')
			.setPlaceholder('Any value but "yes" will be treated as no')
			.setRequired(false)
			.setStyle(TextInputStyle.Short);

		if (existingData?.useButtons != null) {
			useButtonsInput.setValue(existingData?.useButtons ? 'yes' : 'no');
		}

		const modal = new ModalBuilder()
			.setCustomId('modal')
			.setTitle('Create/adjust a role prompt')
			.setComponents(
				new ActionRowBuilder<ModalActionRowComponentBuilder>().setComponents(titleInput),
				new ActionRowBuilder<ModalActionRowComponentBuilder>().setComponents(descriptionInput),
				new ActionRowBuilder<ModalActionRowComponentBuilder>().setComponents(imageUrlInput),
				new ActionRowBuilder<ModalActionRowComponentBuilder>().setComponents(colorInput),
				new ActionRowBuilder<ModalActionRowComponentBuilder>().setComponents(useButtonsInput),
			);

		await parentInteraction.showModal(modal);

		const submission = await awaitModalSubmitOrNull(parentInteraction, { time: 180_000 });
		if (!submission) {
			return null;
		}

		await submission.reply({ content: 'Successfully created/adjusted the prompt', ephemeral: true });

		const title = getModalTextInputValue(submission.fields, 'title', true);
		const description = getModalTextInputValue(submission.fields, 'description');
		const imageUrl = getModalTextInputValue(submission.fields, 'image-url');
		const color = getModalTextInputValue(submission.fields, 'color');
		const useButtons = getModalTextInputValue(submission.fields, 'use-buttons') === 'yes';

		return { title, description, imageUrl, color, useButtons };
	}

	private async handleRoleSelection(parentInteraction: ButtonInteraction<'cached'>, prompt: Prompt) {
		const selectMenu = new RoleSelectMenuBuilder().setCustomId('roles').setMaxValues(25);

		const reply = await parentInteraction.reply({
			content: 'Select the roles this prompt should make assignable',
			components: [new ActionRowBuilder<MessageActionRowComponentBuilder>().setComponents([selectMenu])],
			ephemeral: true,
			fetchReply: true,
		});

		const component = await reply.awaitMessageComponent();
		const roles = (component as RoleSelectMenuInteraction).roles;
		await component.update({ content: `Successfully updated the roles for this prompt`, components: [] });
		await this.prisma.role.deleteMany({ where: { prompt } });
		// @ts-expect-error - d.js has a pending PR to fix this - role shouldn't be nullable
		await this.prisma.role.createMany({ data: roles.map((role) => ({ promptId: prompt.id, roleId: role.id })) });
	}

	private async handlePromptManagement(
		parentInteraction: StringSelectMenuInteraction<'cached'>,
		{ updateMessagePayload, ...state }: State & { updateMessagePayload(): Promise<void> },
	): Promise<State> {
		const deleteButton = new ButtonBuilder().setCustomId('delete').setLabel('Delete').setStyle(ButtonStyle.Danger);
		const editButton = new ButtonBuilder().setCustomId('edit').setLabel('Edit').setStyle(ButtonStyle.Secondary);
		const setRolesButton = new ButtonBuilder()
			.setCustomId('set-roles')
			.setLabel('Set roles')
			.setStyle(ButtonStyle.Primary);
		const displayButton = new ButtonBuilder().setCustomId('display').setLabel('Display').setStyle(ButtonStyle.Primary);
		const dismissButton = new ButtonBuilder()
			.setCustomId('dismiss')
			.setLabel('Dismiss')
			.setStyle(ButtonStyle.Secondary);

		const firstManagementRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().setComponents(
			deleteButton,
			editButton,
			setRolesButton,
			displayButton,
			dismissButton,
		);

		const message = await parentInteraction.reply({
			content: 'Use the buttons below to manage this prompt',
			components: [firstManagementRow],
			ephemeral: true,
		});

		collector: for await (const [component] of message.createMessageComponentCollector({ idle: 180_000 })) {
			switch (component.customId) {
				case 'delete': {
					await this.prisma.prompt.delete({ where: { id: state.selected!.id } });
					state.prompts.splice(state.prompts.indexOf(state.selected!), 1);
					state.selected = null;

					await component.update({ content: 'Successfully deleted the prompt', components: [] });
					await component.deleteReply();
					break collector;
				}

				case 'edit': {
					const data = await this.handlePromptDataCollection(component as ButtonInteraction<'cached'>, state.selected!);
					if (!data) {
						continue;
					}

					const updated = await this.prisma.prompt.update({
						where: { id: state.selected!.id },
						data: { ...data, useButtons: data.useButtons ?? false },
					});
					state.prompts[state.prompts.indexOf(state.selected!)] = updated;
					state.selected = updated;
					break;
				}

				case 'set-roles': {
					await this.handleRoleSelection(component as ButtonInteraction<'cached'>, state.selected!);
					break;
				}

				case 'display': {
					const prompt = state.selected!;
					const roles = await this.prisma.role.findMany({ where: { promptId: prompt.id } });

					if (!roles.length) {
						await component.reply({
							content: 'This prompt has no roles. Set some with the "Set roles" button.',
							ephemeral: true,
						});
						continue;
					}

					const embed = new EmbedBuilder();

					embed.setTitle(prompt.title);
					if (prompt.description) {
						embed.setDescription(prompt.description);
					}

					if (prompt.imageUrl) {
						embed.setImage(prompt.imageUrl);
					}

					if (prompt.color) {
						embed.setColor(prompt.color as HexColorString);
					}

					const actionRows = Array.from({ length: 5 }, () => new ActionRowBuilder<MessageActionRowComponentBuilder>());

					if (prompt.useButtons) {
						for (const [idx, actionRow] of actionRows.entries()) {
							const slice = roles.slice(idx * 5, (idx + 1) * 5);
							actionRow.setComponents(
								slice.map((role) => {
									const button = new ButtonBuilder()
										.setCustomId(`toggle-role|${prompt.id}|${role.roleId}`)
										.setStyle(ButtonStyle.Primary);

									const roleObject = parentInteraction.member.roles.cache.get(role.roleId);
									if (roleObject) {
										button.setLabel(roleObject.name);
									} else {
										button.setLabel('[Deleted Role]').setStyle(ButtonStyle.Secondary).setDisabled(true);
									}

									return button;
								}),
							);
						}
					} else {
						const [actionRow] = actionRows as [ActionRowBuilder];
						actionRow.setComponents(
							new ButtonBuilder()
								.setCustomId(`select-roles|${prompt.id}`)
								.setLabel('Manage your roles')
								.setStyle(ButtonStyle.Primary),
						);
					}

					await parentInteraction.channel!.send({
						embeds: [embed],
						components: filterEmptyActionRows(actionRows),
					});

					await component.reply({ content: 'Successfully sent the prompt to the current channel', ephemeral: true });

					break;
				}

				case 'dismiss': {
					await component.update({ content: 'Dismissed.', components: [] });
					state.selected = null;
					await component.deleteReply();
					break collector;
				}
			}

			await updateMessagePayload();
		}

		return state;
	}

	public async handle(interaction: ChatInputCommandInteraction<'cached'>) {
		const createButton = new ButtonBuilder()
			.setCustomId('create')
			.setLabel('Create a prompt')
			.setStyle(ButtonStyle.Success);

		const managementRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().setComponents(createButton);

		const promptSelectMenu = new StringSelectMenuBuilder()
			.setCustomId('prompt-select')
			.setPlaceholder('Select the prompt you wish to make changes to')
			.setMinValues(1)
			.setMaxValues(1);

		const promptRow = new ActionRowBuilder<MessageActionRowComponentBuilder>();

		let state: State = {
			locked: false,
			prompts: await this.prisma.prompt.findMany({ where: { guildId: interaction.guildId } }),
			selected: null,
		};

		const updateMessagePayload = async (dispatch = true) => {
			createButton.setDisabled(state.locked || state.prompts.length >= 25);
			promptSelectMenu.setDisabled(state.locked);

			if (state.prompts.length) {
				promptSelectMenu.setOptions(
					state.prompts.map((prompt) =>
						new StringSelectMenuOptionBuilder()
							.setLabel(prompt.title)
							.setValue(String(prompt.id))
							.setDefault(state.selected?.id === prompt.id),
					),
				);
				promptRow.setComponents(promptSelectMenu);
			} else {
				promptRow.setComponents([]);
			}

			if (dispatch) {
				await interaction.editReply({
					content: this.resolveMessageContent(state.prompts),
					components: filterEmptyActionRows([managementRow, promptRow]),
				});
			}
		};

		await updateMessagePayload(false);

		const reply = await interaction.reply({
			content: this.resolveMessageContent(state.prompts),
			components: filterEmptyActionRows([managementRow, promptRow]),
			fetchReply: true,
			ephemeral: true,
		});

		for await (const [component] of reply.createMessageComponentCollector({ idle: 180_000 })) {
			switch (component.customId) {
				case 'create': {
					const data = await this.handlePromptDataCollection(component as ButtonInteraction<'cached'>);
					if (!data) {
						continue;
					}

					const created = await this.prisma.prompt.create({
						data: {
							guildId: interaction.guildId,
							...data,
							useButtons: data.useButtons ?? false,
						},
					});

					state.prompts.push(created);

					break;
				}

				case 'prompt-select': {
					const promptId = Number((component as StringSelectMenuInteraction).values[0]);
					state.selected = state.prompts.find((prompt) => prompt.id === promptId)!;

					// Lock the prompt select menu while an individual prompt is being edited
					state.locked = true;
					await updateMessagePayload();

					// eslint-disable-next-line require-atomic-updates
					state = await this.handlePromptManagement(component as StringSelectMenuInteraction<'cached'>, {
						...state,
						updateMessagePayload,
					});

					// Unlock
					// eslint-disable-next-line require-atomic-updates
					state.locked = false;

					break;
				}
			}

			await updateMessagePayload();
		}

		return interaction.editReply({
			content: 'This config menu has expired, use `/setup` again if you wish to continue configuration.',
			components: [],
		});
	}
}
