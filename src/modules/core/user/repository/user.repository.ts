import type { PrismaClientService } from "@infrastructure/prisma-client/prisma-client.service";
import { Injectable } from "@nestjs/common";
import type { User } from "@prisma/client";
import dayjs from "@shared/dayjs";

import type { CreateUserInput, UpdateUserInput } from "../user.types";

@Injectable()
export class UserRepository {
	constructor(private readonly prisma: PrismaClientService) {}

	async create(data: CreateUserInput): Promise<User> {
		return this.prisma.user.create({ data });
	}

	async findById(id: string): Promise<User | null> {
		return this.prisma.user.findFirst({ where: { id, deletedAt: null } });
	}

	async findByFirebaseUid(firebaseUid: string): Promise<User | null> {
		return this.prisma.user.findFirst({
			where: { firebaseUid, deletedAt: null },
		});
	}

	async findByEmail(email: string): Promise<User | null> {
		return this.prisma.user.findFirst({ where: { email, deletedAt: null } });
	}

	async update(id: string, data: UpdateUserInput): Promise<User> {
		return this.prisma.user.update({ where: { id }, data });
	}

	async softDelete(id: string): Promise<User> {
		return this.prisma.user.update({
			where: { id },
			data: { deletedAt: dayjs().toDate() },
		});
	}
}
