import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { loadCorpus } from "./corpus.js";
import { OllamaModel } from "./model.js";
import { HandbookRetriever } from "./retriever.js";
import { QueryService } from "./service.js";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const corpusDirectory = process.env.CORPUS_DIR ?? path.join(projectDirectory, "corpus");
const port = Number(process.env.PORT ?? "3000");

const documents = await loadCorpus(corpusDirectory);
const retriever = new HandbookRetriever(documents);
const service = new QueryService(retriever, new OllamaModel());
const app = createApp(service, true);

const shutdown = async (): Promise<void> => {
  await app.close();
  retriever.close();
};

process.on("SIGINT", () => void shutdown().then(() => process.exit(0)));
process.on("SIGTERM", () => void shutdown().then(() => process.exit(0)));

try {
  await app.listen({ host: "127.0.0.1", port });
} catch (error) {
  app.log.error(error);
  retriever.close();
  process.exit(1);
}
