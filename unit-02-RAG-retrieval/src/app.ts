import Fastify, { type FastifyInstance } from "fastify";
import { QueryError, type QueryService } from "./service.js";

interface QueryBody {
  question: string;
}

export function createApp(service: QueryService, logger = false): FastifyInstance {
  const app = Fastify({ logger, bodyLimit: 16_384 });

  app.post<{ Body: QueryBody }>(
    "/query",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["question"],
          properties: {
            question: { type: "string", minLength: 1, maxLength: 1_000 },
          },
        },
      },
    },
    async (request, reply) => {
      const question = request.body.question.trim();
      if (question.length === 0) {
        return reply.code(400).send({ error: "INVALID_QUESTION" });
      }

      try {
        return await service.query(question);
      } catch (error) {
        request.log.error({ err: error }, "query failed");
        if (error instanceof QueryError) {
          return reply.code(error.statusCode).send({
            error: error.code,
            message: error.message,
          });
        }
        return reply.code(500).send({ error: "INTERNAL_ERROR" });
      }
    },
  );

  return app;
}
