import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from "@angular/core";
import { DaloService } from "../servicios/dalo";
import { MetaService } from "../servicios/meta";

export type EstadoEtapa = "pendiente" | "activa" | "hecha" | "error";

export interface EtapaPipeline {
  id: string;
  nombre: string;
  detalle: string;
  estado: EstadoEtapa;
}

export interface DatoFicha {
  termino: string;
  valor: string;
}

/**
 * Tira de etapas del reconocimiento Señas → Español: dónde trabaja el
 * modelo de Meta y qué es función del navegador o procesamiento clásico,
 * con el estado real de la sesión.
 */
@Component({
  selector: "app-pipeline",
  templateUrl: "./pipeline.html",
  styleUrl: "./pipeline.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Pipeline {
  protected readonly dalo = inject(DaloService);
  protected readonly meta = inject(MetaService);

  protected readonly etapas = computed<EtapaPipeline[]>(() =>
    this.etapasReconocimiento(),
  );

  /** Ficha estructurada de la última respuesta; en reposo no dice nada. */
  protected readonly ficha = computed<DatoFicha[] | null>(() => {
    const meta = this.meta;
    if (meta.error())
      return [
        {
          termino: "Estado",
          valor: "Sin resultado: revisa la propuesta o repite la captura.",
        },
      ];
    if (meta.ocupado())
      return [{ termino: "Estado", valor: `En curso… ${meta.segundos()} s` }];
    const resultado = meta.resultado();
    if (resultado)
      return [
        { termino: "Modelo", valor: resultado.model },
        {
          termino: "Latencia",
          valor: `${(resultado.latencyMs / 1000).toFixed(1)} s`,
        },
        {
          termino: "Confianza",
          valor: `${resultado.confianza} · sin calibrar`,
        },
      ];
    return null;
  });

  private etapasReconocimiento(): EtapaPipeline[] {
    const meta = this.meta;
    const dalo = this.dalo;
    const etapasBackend = new Set(
      meta.pasos().flatMap((paso) => (paso.etapa ? [paso.etapa] : [])),
    );
    const conVideo = !!meta.videoCapturado();
    const conResultado = !!meta.resultado();
    const enBackend =
      meta.ocupado() && !meta.grabando() && !meta.preparandoCaptura();
    const contexto = meta.contexto();
    const resultado = meta.resultado();
    const fase = dalo.faseLsc();

    const camara: EstadoEtapa =
      dalo.camara() === "solicitando"
        ? "activa"
        : dalo.camara() === "activa" || conVideo || conResultado
          ? "hecha"
          : dalo.camara() === "permiso-denegado" ||
              dalo.camara() === "no-disponible"
            ? "error"
            : "pendiente";
    const grabacion: EstadoEtapa = meta.preparandoCaptura() || meta.grabando()
      ? "activa"
      : conVideo || conResultado
        ? "hecha"
        : "pendiente";
    const conversion: EstadoEtapa = etapasBackend.has("contexto")
      ? "hecha"
      : enBackend && conVideo
        ? "activa"
        : conResultado
          ? "hecha"
          : "pendiente";
    const spark: EstadoEtapa = conResultado
      ? "hecha"
      : etapasBackend.has("procesando") ||
          etapasBackend.has("respuesta") ||
          etapasBackend.has("validando")
        ? "activa"
        : enBackend
          ? "activa"
          : meta.error() && meta.pasos().length
            ? "error"
            : "pendiente";
    const propuesta: EstadoEtapa = conResultado
      ? "hecha"
      : etapasBackend.has("validando")
        ? "activa"
        : "pendiente";
    const confirmacion: EstadoEtapa =
      fase === "confirmada"
        ? "hecha"
        : fase === "candidata"
          ? "activa"
          : "pendiente";

    return [
      {
        id: "camara",
        nombre: "Cámara",
        detalle: "getUserMedia · navegador, sin modelo",
        estado: camara,
      },
      {
        id: "grabacion",
        nombre: "Grabación",
        detalle: meta.preparandoCaptura()
          ? `Cuenta ${meta.segundosRestantes()} · aún no se graba`
          : "Video de 3 s · MediaRecorder",
        estado: grabacion,
      },
      {
        id: "conversion",
        nombre: "Conversión",
        detalle: "Backend FFmpeg · MP4 640 px, 12 fps · sin ML",
        estado: conversion,
      },
      {
        id: "spark",
        nombre: "Muse Spark 1.3",
        detalle: contexto
          ? `Modelo Meta · contexto ${contexto.promptVersion}`
          : "Modelo Meta · video completo",
        estado: spark,
      },
      {
        id: "propuesta",
        nombre: "Propuesta",
        detalle: resultado
          ? resultado.clase === "otra"
            ? "Rechazo: fuera del catálogo"
            : `Clase ${resultado.clase} · confianza ${resultado.confianza} sin calibrar`
          : "Clase, confianza y evidencia visual",
        estado: propuesta,
      },
      {
        id: "confirmacion",
        nombre: "Confirmación",
        detalle:
          fase === "confirmada"
            ? "Confirmada por la persona"
            : "La persona confirma o descarta",
        estado: confirmacion,
      },
    ];
  }
}
