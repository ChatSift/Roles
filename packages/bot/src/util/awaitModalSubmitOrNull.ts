import type { AwaitModalSubmitOptions, MessageComponentInteraction, ModalSubmitInteraction } from 'discord.js';

export async function awaitModalSubmitOrNull(
	interaction: MessageComponentInteraction<'cached'>,
	options: AwaitModalSubmitOptions<ModalSubmitInteraction>,
) {
	try {
		return await interaction.awaitModalSubmit(options);
	} catch {
		await interaction.followUp({
			content: 'You took too long to respond. Please try again.',
			ephemeral: true,
		});

		return null;
	}
}
