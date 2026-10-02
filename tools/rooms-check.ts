/**
 * Avant un déploiement (PLAN-C, lot C16) : rejoue une copie des parties en ligne sauvegardées avec le moteur du dépôt, et
 * dit combien reprendraient, combien seraient interrompues (autre version des règles, empreintes différentes) et combien
 * sont illisibles. Les fichiers d'origine ne sont pas touchés.
 *
 * Usage : npx tsx tools/rooms-check.ts [dossier]   (par défaut data/rooms ; MTGX_DATA_DIR s'il est défini)
 */
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RULES_VERSION } from "@mtgx/engine";
import { DEFAULT_CONFIG, RoomManager } from "../packages/server/src/rooms";

const source = process.argv[2] ?? process.env.MTGX_DATA_DIR ?? join(process.cwd(), "data", "rooms");
if (!existsSync(source)) {
  console.log(`Aucune sauvegarde dans ${source} : rien à vérifier.`);
  process.exit(0);
}
const saved = readdirSync(source).filter((f) => f.endsWith(".jsonl"));
const copy = mkdtempSync(join(tmpdir(), "mtgx-rooms-check-"));
try {
  for (const f of saved) cpSync(join(source, f), join(copy, f));
  // Les journaux de la reprise (« Salon … repris ») ne servent pas ici.
  const log = console.log;
  const warn = console.warn;
  const error = console.error;
  console.log = console.warn = console.error = () => {};
  const rooms = new RoomManager({ ...DEFAULT_CONFIG, dataDir: copy, maxRooms: Math.max(saved.length, 1) });
  console.log = log;
  console.warn = warn;
  console.error = error;
  const after = readdirSync(copy);
  const interrupted = after.filter((f) => /\.jsonl\.rules\d+$/.test(f)).length;
  const bad = after.filter((f) => f.endsWith(".jsonl.bad")).length;
  console.log(`Règles du moteur : version ${RULES_VERSION}. Parties sauvegardées : ${saved.length}.`);
  console.log(`  reprises : ${rooms.size}`);
  console.log(`  interrompues par la mise à jour des règles : ${interrupted}`);
  console.log(`  illisibles ou différentes (mises de côté) : ${bad}`);
  rooms.closeAll();
  process.exitCode = interrupted + bad > 0 ? 2 : 0;
} finally {
  rmSync(copy, { recursive: true, force: true });
}
