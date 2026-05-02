import { Injectable, NotFoundException } from "@nestjs/common";

import type { User } from "@prisma/client";

import type { UserRepository } from "../repository/user.repository";
import type { CreateUserInput, UpdateUserInput } from "../user.types";

@Injectable()
export class UserService {
	constructor(private readonly userRepository: UserRepository) {}

	async create(data: CreateUserInput): Promise<User> {
		return this.userRepository.create(data);
	}

	async getById(id: string): Promise<User> {
		const user = await this.userRepository.findById(id);
		if (!user) throw new NotFoundException(`User not found: ${id}`);
		return user;
	}

	async findById(id: string): Promise<User | null> {
		return this.userRepository.findById(id);
	}

	async findByFirebaseUid(firebaseUid: string): Promise<User | null> {
		return this.userRepository.findByFirebaseUid(firebaseUid);
	}

	async findByEmail(email: string): Promise<User | null> {
		return this.userRepository.findByEmail(email);
	}

	async update(id: string, data: UpdateUserInput): Promise<User> {
		await this.getById(id);
		return this.userRepository.update(id, data);
	}

	async upsertByFirebaseUid(data: CreateUserInput): Promise<User> {
		const existing = await this.userRepository.findByFirebaseUid(
			data.firebaseUid,
		);
		if (existing) {
			return this.userRepository.update(existing.id, {
				displayName: data.displayName,
				photoUrl: data.photoUrl,
			});
		}
		return this.userRepository.create(data);
	}
}
