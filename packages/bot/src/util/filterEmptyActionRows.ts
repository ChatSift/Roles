import type { ActionRowBuilder } from 'discord.js';

export function filterEmptyActionRows<T extends ActionRowBuilder[]>(components: T): T {
	return components.filter((row) => row.components.length) as T;
}
