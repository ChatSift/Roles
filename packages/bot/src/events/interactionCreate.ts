import type { Interaction } from 'discord.js';
import { Events, InteractionType } from 'discord.js';
import { singleton } from 'tsyringe';
import { CommandHandler } from '#struct/CommandHandler';
import type { Event } from '#struct/Event';
import { logger } from '#util/logger';

@singleton()
export default class implements Event<typeof Events.InteractionCreate> {
	public readonly name = Events.InteractionCreate;

	public constructor(private readonly commandHandler: CommandHandler) {}

	public async handle(interaction: Interaction) {
		switch (interaction.type) {
			case InteractionType.ApplicationCommandAutocomplete: {
				await this.commandHandler.handleAutocomplete(interaction);
				break;
			}

			case InteractionType.MessageComponent: {
				if (interaction.inCachedGuild()) {
					await this.commandHandler.handleMessageComponent(interaction);
				}

				break;
			}

			case InteractionType.ApplicationCommand: {
				await this.commandHandler.handleCommand(interaction);
				break;
			}

			case InteractionType.ModalSubmit: {
				break;
			}

			default: {
				logger.warn(interaction, 'Unhandled interaction type');
				break;
			}
		}
	}
}
