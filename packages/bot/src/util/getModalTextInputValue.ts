// Because of the way modals work, an optional field that isn't filled out just gives us an empty string, which is awful

import type { ModalSubmitFields } from 'discord.js';

export function getModalTextInputValue(fields: ModalSubmitFields, field: string, required: true): string;
export function getModalTextInputValue(
	fields: ModalSubmitFields,
	field: string,
	required?: boolean | false,
): string | null;

export function getModalTextInputValue(fields: ModalSubmitFields, field: string, required = false): string | null {
	const value = fields.getTextInputValue(field);
	if (required && !value) {
		throw new Error(`Field "${field}" is required`);
	}

	return value?.length ? value : null;
}
