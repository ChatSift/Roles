import { PrismaClient } from '@prisma/client';
import type { ActionRow, ButtonComponent, ButtonInteraction, MessageComponentBuilder } from 'discord.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { singleton } from 'tsyringe';
import type { Component } from '../struct/Component';

@singleton()
export default class implements Component<ButtonInteraction<'cached'>> {
	public constructor(private readonly prisma: PrismaClient) {}

	public async handle(
		interaction: ButtonInteraction<'cached'>,
		rawPromptId: string,
		roleId: string,
		rawActionRowIdx: string,
		rawButtonIdx: string,
	) {
		const promptId = Number(rawPromptId);
		const actionRowIdx = Number(rawActionRowIdx);
		const buttonIdx = Number(rawButtonIdx);

		const roleObject = interaction.guild.roles.cache.get(roleId);

		if (!roleObject) {
			const actionRows = (interaction.message.components as ActionRow<ButtonComponent>[]).map((row, idx) => {
				const builder = new ActionRowBuilder<ButtonBuilder>(row);

				if (idx === actionRowIdx) {
					return builder.setComponents(
						(row.components as ButtonComponent[]).map((button, idx) => {
							const builder = new ButtonBuilder(button.toJSON());

							if (idx === buttonIdx) {
								return builder.setLabel('[Deleted Role]').setDisabled(true).setStyle(ButtonStyle.Secondary);
							}

							return builder;
						}),
					);
				}

				return builder;
			});

			await interaction.update({ components: actionRows });
			return interaction.followUp({ content: 'This role appears to have been deleted.', ephemeral: true });
		}

		// If it's somehow not in the database this is likely a bug/compromised custom_id of sorts
		await this.prisma.role.findFirstOrThrow({ where: { roleId, promptId } });

		if (interaction.member.roles.cache.has(roleId)) {
			await interaction.member.roles.remove(roleId);
			return interaction.reply({ content: `Successfully removed role ${roleObject.name}`, ephemeral: true });
		}

		await interaction.member.roles.add(roleId);
		return interaction.reply({ content: `Successfully added role ${roleObject.name}`, ephemeral: true });
	}
}
