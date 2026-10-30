// Catálogo de expresiones de Daló.
// Las entradas reconocibles se usan en la variante experimental con Meta.
// Los videos validados y los servicios de pago siguen pendientes.
// Ninguna entrada está validada lingüísticamente.
import cordialidad from "./cordialidad.json";

export interface Expresion {
  id: string;
  nombre: string;
  significado: string;
  intencion: string;
  formulaciones: string[];
  /** URL del video validado en LSC. `null` = aún no hay material autorizado. */
  videoUrl: string | null;
  videoDisponible: boolean;
  /**
   * URL de la secuencia de puntos (avatar esquelético) derivada de LSC-54.
   * `null` = sin secuencia extraída. No sustituye la validación lingüística.
   */
  avatarUrl: string | null;
  /**
   * URL de la animación VRM (.vrma), independiente del avatar y del JSON.
   * Tiene prioridad sobre avatarUrl. `null` = sin animación.
   */
  animacionUrl: string | null;
  reconocible: boolean;
  estado: "En preparación";
  fuente: string;
  variante: string;
  validacion: string;
}

export const DALO_CATALOG: Expresion[] = [
  {
    id: "hola",
    nombre: "Hola",
    significado: "Hola",
    intencion: "Saludar",
    formulaciones: ["hola", "buenas", "saludos"],
    videoUrl: null,
    videoDisponible: false,
    animacionUrl: "avatar/hola.vrma?v=09cba1b007",
    avatarUrl: "avatar/hola.json",
    reconocible: true,
    estado: "En preparación",
    fuente:
      "Animación reconstruida y corregida con referencia a LSC-54 · participante 1 · Cordialidad/Hola/0.avi; pendiente de validar permisos de publicación y corrección lingüística",
    variante: "Pendiente de validación",
    validacion: "Sin validación con persona competente en LSC",
  },
  {
    id: "bienvenido",
    nombre: "Bienvenido",
    significado: "Bienvenido",
    intencion: "Dar la bienvenida",
    formulaciones: ["bienvenido", "bienvenida", "bienvenidos", "bienvenidas"],
    videoUrl: null,
    videoDisponible: false,
    animacionUrl: "avatar/bienvenido.vrma",
    avatarUrl: "avatar/bienvenido.json",
    reconocible: true,
    estado: "En preparación",
    fuente:
      "Animación reconstruida con referencia a LSC-54 · participantes 1, 3 y 21 · Cordialidad/Bienvenido; pendiente de validar permisos de publicación y corrección lingüística",
    variante: "Pendiente de validación",
    validacion: "Sin validación con persona competente en LSC",
  },
  {
    id: "apoyar",
    nombre: "Apoyar",
    significado: "Apoyar",
    intencion: "Ofrecer apoyo",
    formulaciones: ["apoyar", "apoyo", "apoya", "apoyame"],
    videoUrl: null,
    videoDisponible: false,
    animacionUrl: "avatar/apoyar.vrma?v=764a3cd083",
    avatarUrl: "avatar/apoyar.json",
    reconocible: false,
    estado: "En preparación",
    fuente:
      "Animación reconstruida con referencia a LSC-54 · participantes 1, 3, 17, 19, 21, 22, 23, 24 y 25 · Cordialidad/Apoyar; pendiente de validar permisos de publicación y corrección lingüística",
    variante: "Pendiente de validación",
    validacion: "Sin validación con persona competente en LSC",
  },
  {
    id: "gracias",
    nombre: "Gracias",
    significado: "Gracias",
    intencion: "Agradecer",
    formulaciones: ["gracias", "te agradezco", "mil gracias"],
    videoUrl: null,
    videoDisponible: false,
    animacionUrl: "avatar/gracias.vrma",
    avatarUrl: "avatar/gracias.json",
    reconocible: true,
    estado: "En preparación",
    fuente:
      "LSC-54 · Signer_1 · Cordialidad/Gracias · vid_0/rep_0 (secuencia de puntos, sin permiso de publicación verificado); animación reconstruida con referencia a LSC-54 · participantes 1, 3, 19, 21, 22 y 24 · Cordialidad/Gracias",
    variante: "Pendiente de validación",
    validacion: "Sin validación con persona competente en LSC",
  },
  {
    id: "ayuda",
    nombre: "Ayuda",
    significado: "Necesito ayuda",
    intencion: "Pedir ayuda",
    formulaciones: [
      "ayuda",
      "ayudar",
      "necesito ayuda",
      "me puedes ayudar",
      "me ayudas",
      "ayudame",
    ],
    videoUrl: null,
    videoDisponible: false,
    animacionUrl: "avatar/ayuda.vrma?v=82d2b33019",
    avatarUrl: "avatar/ayuda.json",
    reconocible: false,
    estado: "En preparación",
    fuente:
      "LSC-54 · Signer_1 · Cordialidad/Ayudar · vid_0/rep_0 (secuencia de puntos, sin permiso de publicación verificado); animación reconstruida con referencia a LSC-54 · participantes 1, 3, 21, 22, 26 y 30 · Cordialidad/Ayudar",
    variante: "Pendiente de validación",
    validacion: "Sin validación con persona competente en LSC",
  },
  {
    id: "chao",
    nombre: "Chao",
    significado: "Chao",
    intencion: "Despedirse",
    formulaciones: [
      "chao",
      "adios",
      "hasta luego",
      "nos vemos",
      "hasta pronto",
    ],
    videoUrl: null,
    videoDisponible: false,
    animacionUrl: "avatar/chao.vrma",
    avatarUrl: "avatar/chao.json",
    reconocible: true,
    estado: "En preparación",
    fuente:
      "LSC-54 · Signer_1 · Cordialidad/Chao · vid_0/rep_0 (secuencia de puntos, sin permiso de publicación verificado); animación reconstruida con referencia a LSC-54 · participantes 1, 3, 17, 19, 22, 24 y 30 · Cordialidad/Chao",
    variante: "Pendiente de validación",
    validacion: "Sin validación con persona competente en LSC",
  },
  {
    id: "perdon",
    nombre: "Perdón",
    significado: "Perdón",
    intencion: "Disculparse",
    formulaciones: ["perdon", "perdona", "perdoname", "disculpa"],
    videoUrl: null,
    videoDisponible: false,
    animacionUrl: "avatar/perdon.vrma",
    avatarUrl: "avatar/perdon.json",
    reconocible: true,
    estado: "En preparación",
    fuente:
      "LSC-54 · Signer_1 · Cordialidad/Perdon · vid_0/rep_0 (secuencia de puntos, sin permiso de publicación verificado); animación reconstruida con referencia a LSC-54 · participantes 1, 3, 19, 22, 24 y 30 · Cordialidad/Perdon",
    variante: "Pendiente de validación",
    validacion: "Sin validación con persona competente en LSC",
  },
  {
    id: "perfecto",
    nombre: "Perfecto",
    significado: "Perfecto",
    intencion: "Expresar que algo está perfecto",
    formulaciones: ["perfecto", "perfecta", "esta perfecto"],
    videoUrl: null,
    videoDisponible: false,
    animacionUrl: "avatar/perfecto.vrma",
    avatarUrl: "avatar/perfecto.json",
    reconocible: true,
    estado: "En preparación",
    fuente:
      "LSC-54 · Signer_1 · Cordialidad/Perfecto · vid_0/rep_0 (secuencia de puntos, sin permiso de publicación verificado); animación reconstruida con referencia a LSC-54 · participantes 1, 3, 17, 19, 22 y 24 · Cordialidad/Perfecto",
    variante: "Pendiente de validación",
    validacion: "Sin validación con persona competente en LSC",
  },
  {
    id: "esperar",
    nombre: "Esperar",
    significado: "Esperar",
    intencion: "Pedir espera",
    formulaciones: ["esperar", "espera", "esperame", "un momento"],
    videoUrl: null,
    videoDisponible: false,
    animacionUrl: "avatar/esperar.vrma",
    avatarUrl: "avatar/esperar.json",
    reconocible: true,
    estado: "En preparación",
    fuente:
      "Animación reconstruida con referencia a LSC-54 · participantes 1, 3 y 21 · Cordialidad/Esperar; pendiente de validar permisos de publicación y corrección lingüística",
    variante: "Pendiente de validación",
    validacion: "Sin validación con persona competente en LSC",
  },
  {
    id: "losiento",
    nombre: "Lo siento",
    significado: "Lo siento",
    intencion: "Lamentar",
    formulaciones: ["lo siento", "lo lamento"],
    videoUrl: null,
    videoDisponible: false,
    animacionUrl: "avatar/losiento.vrma",
    avatarUrl: "avatar/losiento.json",
    reconocible: true,
    estado: "En preparación",
    fuente:
      "Animación reconstruida con referencia a LSC-54 · participantes 1, 3 y 21 · Cordialidad/Lo siento; pendiente de validar permisos de publicación y corrección lingüística",
    variante: "Pendiente de validación",
    validacion: "Sin validación con persona competente en LSC",
  },
  ...cordialidad.map((entrada): Expresion => ({
    id: entrada.id,
    nombre: entrada.nombre,
    significado: entrada.nombre,
    intencion: entrada.intencion,
    formulaciones: entrada.formulaciones,
    videoUrl: null,
    videoDisponible: false,
    avatarUrl: `avatar/${entrada.id}.json`,
    animacionUrl: `avatar/${entrada.id}.vrma`,
    reconocible: ["bien", "mal"].includes(entrada.id),
    estado: "En preparación",
    fuente: `Primera animación con trayectorias de LSC-54 · participante 1 · Cordialidad/${entrada.expresion}/0.avi y poses de manos reconstruidas; pendiente de revisión, permisos de publicación y validación lingüística`,
    variante: "Pendiente de validación",
    validacion: "Sin validación con persona competente en LSC",
  })),
];
