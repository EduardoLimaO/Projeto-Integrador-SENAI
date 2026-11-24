import { UID_TO_CABIN } from "../hardware.config";

const uidForCabin = new Map<number, string>(Object.entries(UID_TO_CABIN).map(([uid, cabin]) => [cabin, uid]));

export function startDemoSource(emit: (line: string) => void): () => void {
  let tick = 0;
  let lastAccessAllowed = false;
  let currentCabin = 1;
  emit("Angulo inicial assumido: 90 graus");
  emit("RC522 detectado. Aproxime uma tag.");

  const timer = setInterval(() => {
    tick += 1;
    const ldrEsq = 2048 + Math.round(520 * Math.sin(tick / 47));
    const ldrDir = 2048 + Math.round(520 * Math.sin((tick + 13) / 47));
    const diferenca = ldrDir - ldrEsq;
    const angulo = Math.max(0, Math.min(180, 90 + Math.round(diferenca / 20)));
    const motor = diferenca > 100 ? "DIREITA/OESTE" : diferenca < -100 ? "ESQUERDA/LESTE" : "PARADO";
    emit(`LDR E:${ldrEsq} D:${ldrDir} | Dif:${diferenca} | Angulo:${angulo} | Motor:${motor}`);

    if (tick % 100 === 1) {
      const cycle = Math.floor((tick - 1) / 100) + 1;
      lastAccessAllowed = cycle % 3 !== 2;
      currentCabin = ((cycle - 1) % 4) + 1;
      if (lastAccessAllowed) {
        const uid = uidForCabin.get(currentCabin);
        if (uid) emit(`TAG LIDA: ${uid} -> ACESSO PERMITIDO - CABINE ${currentCabin}`);
      } else {
        emit("TAG LIDA: FF FF FF FF -> ACESSO NEGADO");
      }
    }

    if (lastAccessAllowed && tick % 100 === 2) emit(`TRAVA DA CABINE ${currentCabin} ABERTA POR 4 SEGUNDOS`);
    if (lastAccessAllowed && tick % 100 === 42) emit(`TRAVA DA CABINE ${currentCabin} TRANCADA`);
  }, 100);

  return () => clearInterval(timer);
}
