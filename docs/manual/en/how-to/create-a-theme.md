# Create a theme

This guide builds a custom theme with the `wb-theme` kit and installs it on a wirebound server, so every screen in a project takes your look.
It is for front-end developers. You need Node.js 22.18 or later, and an instance admin account to upload the theme.

## How themes work

A theme is a `.wbtheme` package. It holds design tokens (colors, type, spacing), a CSS file, and optional React views that replace the default markup of individual components.
The server ships one built-in theme, **기본테마** (default theme). Each project picks a theme and a version in its settings.

## 1. Get the starter project

1. Sign in as the instance admin and open **테마** (Themes) in the left sidebar.
2. Select **스타터 템플릿 받기** (Download starter template) and unzip `wirebound-theme-starter.zip`.
3. Install the dependencies in the unzipped folder.

   ```bash
   npm install
   ```

The starter contains:

| Path | Purpose |
| --- | --- |
| `theme.config.ts` | Theme name, version, tokens, and variants |
| `src/views/*.tsx` | Component views, starting from the SDK default views |
| `src/theme.css` | Theme CSS |
| `assets/` | Images and fonts |
| `SKILL.md` | Authoring rules. Give this file to your coding agent too. |

## 2. Preview while you edit

```bash
npm run dev
```

Open the printed address. Every component appears in every variant. Edits to views and CSS show up immediately.
Change token values in the left panel, and switch the viewport width in the header.

## 3. Check and build

```bash
npx wb-theme check
npm run build
```

`wb-theme check` validates the view contract. The build writes `dist/<id>-<version>.wbtheme`.
If the manifest has problems, the build prints one reason per line and writes no file.

## 4. Upload and use it

1. Open **테마** (Themes) again and select **테마 패키지 올리기** (Upload theme package). Choose the `.wbtheme` file.
2. In a project, open **설정** (Settings) › **테마** (Theme) and pick the new theme and version.

You cannot upload the same version twice. Raise `version` in `theme.config.ts` every time you change the theme.

## Use the kit without the starter

The kit is also on npm. Add it to an existing project:

```bash
npm install -D @wirebound/theme-kit
npm install @wirebound/theme-sdk react react-dom
```

`npx wb-theme --help` lists the commands: `dev`, `build`, `check`, and `shots` (screenshots per viewport width).
The package format is specified in the design document, section [6. Theme system](../../../superpowers/specs/2026-08-03-wirebound-design.md#6-테마-시스템) (in Korean).

## Next steps

- [Reference](../reference.md) for the `wb-theme` options
