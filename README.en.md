# Daló · LSC ↔ Spanish

[Español](README.md) · [English](README.en.md)

Daló supports everyday communication between users of **Colombian Sign Language (LSC)** and Spanish speakers.

Type or dictate an expression to see its sign, or use the camera to get a suggested interpretation in Spanish.

> **Experimental prototype:** includes 33 animated expressions and recognizes 11 signs through the camera, including Muy bien. Its vocabulary is limited and requires validation by people proficient in LSC. It does not replace professional interpreters.

## What you can do

- **Spanish → Signs:** type or dictate an expression from the catalog and play its animation.
- **Signs → Spanish:** press Capture, wait for **3, 2, 1**, then perform your sign when the red dot appears. Recording lasts three seconds; you then review and confirm the suggestion.
- **Browse expressions:** search, filter by camera recognition or avatar availability, and enlarge animations.

The supported signs are **Hola** (hello), **Gracias** (thank you), **Chao** (goodbye), **Perfecto** (perfect), **Esperar** (wait), **Lo siento** (I'm sorry), **Bienvenido** (welcome), **Perdón** (pardon), **Bien** (good), **Mal** (bad), and **Muy bien** (very good).

Model details, sources, and evaluation tools are available in the application's **Detalles técnicos** (Technical details) panels. The application interface is in Spanish.

## Run locally

You need **Node.js 24**, **npm 11**, **FFmpeg**, and a **Meta API key** with access to Muse Spark Contributor and Muse Voice Transcribe. Recognition and dictation require an Internet connection.

### 1. Set up the project

In a fresh checkout, install dependencies from the repository root:

> If `web-meta/node_modules` is a link to a shared directory, keep the existing dependencies and skip its installation. Do not run `npm ci` on that link.

```powershell
npm --prefix backend-meta ci
npm --prefix web-meta ci
```

Create the configuration file if it does not already exist:

```powershell
if (!(Test-Path backend-meta/.env)) {
  Copy-Item backend-meta/.env.example backend-meta/.env
}
```

Set `META_API_KEY` in `backend-meta/.env`. Keep the key in the backend only; do not publish it or copy it to the frontend.

### 2. Start the application

Open two terminals at the repository root.

**Terminal 1 — backend:**

```powershell
npm run dev:backend
```

**Terminal 2 — frontend:**

```powershell
npm run dev:frontend
```

Open [Daló in your browser](http://localhost:4201). The interface connects to the local backend through `/api`.

For environment variables and deployment instructions, see [Development and production](docs/ENTORNOS.md) (in Spanish).

## Project structure

| Directory                | Contents                                                  |
| ------------------------ | --------------------------------------------------------- |
| `web-meta/`              | Angular interface and 3D avatar.                          |
| `backend-meta/`          | API built with strict TypeScript and Express 5.           |
| `backend-meta/senas/`    | One JSON file per sign, including its visual description. |

Signs are grouped into **courtesy expressions**, **numbers**, and **colors**. Only courtesy expressions currently contain data. Their directory names are `cordialidad`, `numeros`, and `colores`.

To add a sign using multiple LSC-54 videos, use the [dalo-agregar-senas](skills/dalo-agregar-senas/SKILL.md) skill (instructions in Spanish).

## Problems, limitations, and possible solutions

The following solutions are proposed work; their effectiveness must be tested before expanding recognition.

| Problem or limitation | Current behavior | Possible solution |
| --- | --- | --- |
| Confusion between similar signs | Tranquilo is confused with Perdón; other signs share similar hand shapes or contact patterns. | Review variants with people proficient in LSC and clarify orientation, contact, and trajectory using contrasting videos. |
| Inconsistent motion interpretation | Some responses describe only a resting pose even though the video contains a sign. | Compare video and chronological frames on the same examples, review framing and quality, and measure whether changes reduce errors. |
| Words outside the catalog | An unknown sign can be confused with one in the catalog. | Expand negative words and evaluate false positives before enabling each candidate. Keep user confirmation. |
| Uncalibrated confidence | A model's stated 90% confidence can accompany a wrong answer. Samples are few and have been used previously. | Evaluate more people and new recordings, separate development from evaluation, and measure how confidence relates to correctness. |
| Limited vocabulary and animations | There are **11 recognizable signs** and **33 animated expressions**. Spanish → Signs searches the catalog; it does not translate unrestricted sentences. Animations need linguistic and permissions review. | Add signs gradually, check for regressions, and review animations and rights before publication. |
| API dependency | Recognition and dictation require Internet. Responses can be slow or fail. | Measure latency and availability, communicate failures, and evaluate bounded retries for transient errors. |

The prototype **has no independent validation guaranteeing accuracy with new participants**. See the [current status and limitations](docs/GUIA-TECNICA.md#estado-y-limitaciones) (in Spanish). The repository contains application code and runtime resources; it does not distribute datasets, recordings, or private evaluation results.

**Data use:** video is sent to **Muse Spark 1.3 Contributor**, and dictation audio to **Muse Voice Transcribe**. Contributor allows Meta to use submitted content for training. Consider this before submitting personal recordings.

## Development

From the repository root:

```powershell
npm run check
npm run build
```

Further documentation is available in Spanish:

- [Backend: architecture, endpoints, and tests](backend-meta/README.md)
- [Frontend: behavior and checks](web-meta/README.md)
- [Technical guide: models, signs, and evaluation](docs/GUIA-TECNICA.md)
- [Environments and deployment](docs/ENTORNOS.md)

## Credits

A project for the **Meta Global AI Developer Hackathon 2026**. It uses **LSC-54** reference data and the **Sendagaya Shibu / AvatarSample_1** avatar by VRoid Project / pixiv.

See the [full authorship, sources, and attributions](docs/ATRIBUCIONES.md) (in Spanish).
