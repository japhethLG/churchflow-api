export interface CreateUserInput {
	firebaseUid: string;
	email: string;
	displayName: string;
	photoUrl?: string | null;
	isSuperAdmin?: boolean;
}

export interface UpdateUserInput {
	displayName?: string;
	photoUrl?: string | null;
	isSuperAdmin?: boolean;
}
