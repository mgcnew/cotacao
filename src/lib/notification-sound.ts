"use client";

import { useSyncExternalStore } from "react";

/**
 * Som das notificações, gerado na hora pela Web Audio API: duas notas curtas
 * e baixas, sem arquivo para baixar.
 *
 * A preferência fica no aparelho (`localStorage`), como o tema: quem divide
 * o computador da loja com o balcão pode querer silêncio só ali. Vem ligado.
 *
 * O navegador só deixa tocar som depois que a pessoa interagiu com a página.
 * `prepararSom` cria o contexto de áudio no primeiro clique ou tecla; um aviso
 * que chegar antes disso passa em silêncio, mas o sino continua contando.
 */

const CHAVE = "cotapro:som-notificacoes";
const ULTIMO = "cotapro:ultimo-aviso-sonoro";
const MUDOU = "cotapro:som-mudou";

function lerLigado() {
  try {
    return localStorage.getItem(CHAVE) !== "off";
  } catch {
    return true;
  }
}

export function definirSom(ligado: boolean) {
  try {
    localStorage.setItem(CHAVE, ligado ? "on" : "off");
  } catch {
    // Sem armazenamento (aba anônima bloqueada): vale só até recarregar.
  }
  window.dispatchEvent(new Event(MUDOU));
  if (ligado) tocarAviso();
}

function assinar(avisar: () => void) {
  const naOutraAba = (event: StorageEvent) => {
    if (event.key === CHAVE) avisar();
  };
  window.addEventListener(MUDOU, avisar);
  window.addEventListener("storage", naOutraAba);
  return () => {
    window.removeEventListener(MUDOU, avisar);
    window.removeEventListener("storage", naOutraAba);
  };
}

export function useSomLigado() {
  return useSyncExternalStore(assinar, lerLigado, () => true);
}

let contexto: AudioContext | null = null;

function obterContexto() {
  if (!contexto) {
    const Contexto =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Contexto) return null;
    contexto = new Contexto();
  }
  if (contexto.state === "suspended") void contexto.resume();
  return contexto;
}

/** Destrava o áudio no primeiro gesto da pessoa; devolve a limpeza. */
export function prepararSom() {
  const destravar = () => {
    obterContexto();
    remover();
  };
  const remover = () => {
    window.removeEventListener("pointerdown", destravar);
    window.removeEventListener("keydown", destravar);
  };
  window.addEventListener("pointerdown", destravar);
  window.addEventListener("keydown", destravar);
  return remover;
}

/**
 * Toca o aviso. Com `id`, cada evento soa uma vez só, mesmo com o sistema
 * aberto em várias abas: a primeira que receber anota o id e as outras pulam.
 */
export function tocarAviso(id?: string) {
  if (!lerLigado()) return;
  if (id) {
    try {
      if (localStorage.getItem(ULTIMO) === id) return;
      localStorage.setItem(ULTIMO, id);
    } catch {
      // Sem armazenamento: cada aba toca a sua.
    }
  }

  const audio = obterContexto();
  if (!audio || audio.state !== "running") return;

  const agora = audio.currentTime;
  // Lá e mi uma quinta acima: sobe, como quem chama, sem soar alarme.
  [
    { frequencia: 880, inicio: 0 },
    { frequencia: 1318.5, inicio: 0.12 },
  ].forEach(({ frequencia, inicio }) => {
    const oscilador = audio.createOscillator();
    const volume = audio.createGain();
    oscilador.type = "sine";
    oscilador.frequency.value = frequencia;
    const t = agora + inicio;
    volume.gain.setValueAtTime(0.0001, t);
    volume.gain.exponentialRampToValueAtTime(0.18, t + 0.015);
    volume.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    oscilador.connect(volume).connect(audio.destination);
    oscilador.start(t);
    oscilador.stop(t + 0.4);
  });
}
