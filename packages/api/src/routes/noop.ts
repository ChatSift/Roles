import { Route, RouteMethod } from '@chatsift/rest-utils';
import { PrismaClient } from '@prisma/client';
import type { NextHandler, Request, Response } from 'polka';
import { singleton } from 'tsyringe';

@singleton()
export default class extends Route<never, never> {
	public info = {
		method: RouteMethod.get,
		path: '/roles/v1/guilds/:guildId/noop',
	} as const;

	public constructor(private readonly prisma: PrismaClient) {
		super();
	}

	public async handle(_: Request, res: Response, __: NextHandler) {
		res.statusCode = 200;
		res.setHeader('Content-Type', 'application/json');
		res.end(JSON.stringify({ noop: true }));
	}
}
