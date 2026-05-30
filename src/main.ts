import { ClaimsRefreshInterceptor } from "@infrastructure/config/interceptors/claims-refresh.interceptor";
import { GlobalResponseInterceptor } from "@infrastructure/config/interceptors/global-response.interceptor";
import { LoggingInterceptor } from "@infrastructure/config/interceptors/logging.interceptor";
import { ValidationPipe, VersioningType } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory, Reflector } from "@nestjs/core";
import compression from "compression";

import { MainModule } from "./main.module";
import { setupSwagger } from "./swagger.config";

async function bootstrap(): Promise<void> {
	const app = await NestFactory.create(MainModule, {
		logger: ["error", "warn", "log"],
	});

	app.setGlobalPrefix("api");
	app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });

	// gzip/deflate JSON responses. List/detail payloads compress ~70-90%,
	// which matters on mobile (this serves a PWA/TWA). Disable with
	// DISABLE_HTTP_COMPRESSION=true when fronted by a compressing reverse
	// proxy (nginx/Cloud Run) to avoid double work.
	if (process.env.DISABLE_HTTP_COMPRESSION !== "true") {
		app.use(compression());
	}

	const reflector = app.get(Reflector);
	app.useGlobalInterceptors(
		// Outermost: times the full request (incl. the other interceptors).
		new LoggingInterceptor(),
		new ClaimsRefreshInterceptor(reflector),
		new GlobalResponseInterceptor(),
	);
	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			forbidNonWhitelisted: true,
			transform: true,
			transformOptions: { enableImplicitConversion: true },
		}),
	);

	app.enableCors({
		origin: true,
		methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
		credentials: true,
		// Browsers hide non-simple response headers from JS unless
		// explicitly exposed. The frontend reads X-Claims-Refreshed to
		// know when to re-mint the Next session cookie.
		exposedHeaders: ["X-Claims-Refreshed"],
	});

	// Scalar/Swagger exposes the full API surface unauthenticated, so keep
	// it out of production. FE type generation (`npm run api:types`) hits
	// the dev server, which still mounts it. Force-enable in prod with
	// ENABLE_SWAGGER=true if a gated docs host is ever needed.
	if (
		process.env.NODE_ENV !== "production" ||
		process.env.ENABLE_SWAGGER === "true"
	) {
		setupSwagger(app);
	}

	const configService = app.get(ConfigService);
	const port = configService.get<number>("PORT") ?? 8000;

	await app.listen(port);
	console.log(`Church App backend listening on http://localhost:${port}`);
}

bootstrap();
