/** Case « Images par le serveur MTG Mate » : relais des images quand le réseau bloque Scryfall (voir images.ts). */
import { useImages, useRelayActive } from "./images";

export function ImageRelayToggle() {
  const setMode = useImages((s) => s.setMode);
  const active = useRelayActive();
  return (
    <label
      className="toggle image-relay"
      title="À cocher si les cartes ne s'affichent pas (Scryfall bloqué par votre réseau) : les images passent par le serveur MTG Mate."
    >
      <input type="checkbox" checked={active} onChange={(e) => setMode(e.target.checked ? "on" : "off")} />
      Images par le serveur MTG Mate
    </label>
  );
}
