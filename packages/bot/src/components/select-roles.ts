import { PrismaClient } from '@prisma/client';
import type { ButtonInteraction, StringSelectMenuInteraction } from 'discord.js';
import {
	ActionRow,
	ButtonComponent,
	MessageComponentBuilder,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
} from 'discord.js';
import { singleton } from 'tsyringe';
import type { Component } from '../struct/Component';

@singleton()
export default class implements Component<ButtonInteraction<'cached'>> {
	public constructor(private readonly prisma: PrismaClient) {}

	public async handle(interaction: ButtonInteraction<'cached'>, rawPromptId: string) {
		await interaction.deferReply({ ephemeral: true });

		const promptId = Number(rawPromptId);
		const roles = await this.prisma.role.findMany({ where: { promptId } });
		if (!roles.length) {
			return interaction.editReply('There are no roles to select. This prompt was likely deleted');
		}

		const selfAssignables = new Set<string>(roles.map((role) => role.roleId));

		const selectMenu = new StringSelectMenuBuilder()
			.setCustomId('selection')
			.setMinValues(0)
			.setMaxValues(roles.length)
			.setOptions(
				roles
					.map((role) => {
						const roleObject = interaction.guild.roles.cache.get(role.roleId);
						if (!roleObject) {
							return null;
						}

						return new StringSelectMenuOptionBuilder()
							.setLabel(roleObject.name)
							.setValue(roleObject.id)
							.setDefault(interaction.member.roles.cache.has(role.roleId));
					})
					.filter((builder): builder is StringSelectMenuOptionBuilder => builder !== null),
			);

		const selectionInteraction = await interaction.editReply({
			content: 'Select the roles you want to have from the dropdown below',
			components: [new ActionRowBuilder<StringSelectMenuBuilder>().setComponents(selectMenu)],
		});

		const selection = (await selectionInteraction.awaitMessageComponent()) as StringSelectMenuInteraction<'cached'>;

		const currentRoles = new Set(interaction.member.roles.cache.keys());

		const added: string[] = [];
		const removed: string[] = [];

		const selected = new Set(selection.values);

		for (const role of roles) {
			if (selfAssignables.has(role.roleId) && !selected.has(role.roleId)) {
				currentRoles.delete(role.roleId);
				removed.push(`<@&${role.roleId}>`);
			}
		}

		for (const role of selected) {
			if (!currentRoles.has(role)) {
				currentRoles.add(role);
				added.push(`<@&${role}>`);
			}
		}

		await interaction.member.roles.set([...currentRoles.values()]);

		return selection.update({
			content:
				added.length || removed.length
					? `Succesfully updated your roles:\n${added.length ? `• added: ${added.join(', ')}\n` : ''}${
							removed.length ? `• removed: ${removed.join(', ')}` : ''
					  }`
					: 'There was nothing to update!',
			components: [],
		});
	}
}
