import { readFileSync } from "node:fs";
import type { OnModuleInit } from "@nestjs/common";
import { Injectable, Logger } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import * as admin from "firebase-admin";

@Injectable()
export class FirebaseAdminService implements OnModuleInit {
	private readonly logger = new Logger(FirebaseAdminService.name);
	private app!: admin.app.App;

	constructor(private readonly config: ConfigService) {}

	onModuleInit(): void {
		if (admin.apps.length > 0) {
			this.app = admin.apps[0] as admin.app.App;
			return;
		}

		const credential = this.loadCredential();
		this.app = admin.initializeApp({ credential });
		this.logger.log("Firebase Admin initialised");
	}

	getAuth(): admin.auth.Auth {
		return this.app.auth();
	}

	async verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
		return this.getAuth().verifyIdToken(idToken, true);
	}

	async setCustomClaims(
		uid: string,
		claims: Record<string, unknown>,
	): Promise<void> {
		await this.getAuth().setCustomUserClaims(uid, claims);
	}

	async getUser(uid: string): Promise<admin.auth.UserRecord> {
		return this.getAuth().getUser(uid);
	}

	private loadCredential(): admin.credential.Credential {
		const path = this.config.get<string>("FIREBASE_SERVICE_ACCOUNT_PATH");

		if (path) {
			const file = JSON.parse(readFileSync(path, "utf-8"));
			return admin.credential.cert(file);
		}

		const projectId = this.config.get<string>("FIREBASE_PROJECT_ID");
		const clientEmail = this.config.get<string>("FIREBASE_CLIENT_EMAIL");
		const privateKey = this.config
			.get<string>("FIREBASE_PRIVATE_KEY")
			?.replace(/\\n/g, "\n");

		if (!projectId || !clientEmail || !privateKey) {
			throw new Error(
				"Firebase credentials missing. Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_{PROJECT_ID,CLIENT_EMAIL,PRIVATE_KEY}.",
			);
		}

		return admin.credential.cert({ projectId, clientEmail, privateKey });
	}
}
