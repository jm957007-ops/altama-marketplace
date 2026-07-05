# Altama Marketplace

Marketplace multi-vendedor para la zona conurbada Tampico · Madero · Altamira.

## Ya incluido

- `src/firebase.js` ya está configurado para usar el mismo proyecto de Firebase
  que la app de vacaciones (`control-vacaciones-7f9d8`), pero en una colección
  distinta (`altama`), así que no interfieren entre sí.
- `netlify.toml` ya trae `SECRETS_SCAN_ENABLED = "false"` integrado, para que
  no vuelva a fallar el build por el falso positivo de la apiKey de Firebase
  (ya no hace falta agregar esa variable manualmente en Netlify).

## Pasos para subir

### 1. Subir a GitHub

Sube **todo el contenido de esta carpeta** (incluyendo la carpeta `src`
completa) a un repositorio nuevo. La forma más confiable: arrastra la carpeta
`src` completa de una sola vez al área de "Upload files" de GitHub, junto con
los demás archivos sueltos (`index.html`, `package.json`, `netlify.toml`,
`vite.config.js`).

La estructura final debe verse así:
```
├── index.html
├── netlify.toml
├── package.json
├── vite.config.js
└── src/
    ├── App.jsx
    ├── firebase.js
    └── main.jsx
```

### 2. Conectar con Netlify

1. netlify.com → "Add new site" → "Import an existing project" → GitHub.
2. Elige el repositorio.
3. Netlify detecta automáticamente `npm run build` y la carpeta `dist`
   gracias al `netlify.toml`.
4. "Deploy site".

### 3. Verificar las reglas de Firestore

Como reutilizas el mismo proyecto de Firebase, las reglas de Firestore que ya
configuraste (`allow read, write: if true;`) siguen aplicando aquí también —
no necesitas tocar nada en Firebase.

### 4. Cambiar la contraseña de administrador

Está en `src/App.jsx`, línea `ADMIN_PASSWORD = "zonaconurbada2026"`. Cámbiala
antes de compartir el enlace.

## Nota sobre las fotos de producto

La subida de fotos con cámara (en el formulario de "Nuevo producto") solo
funciona en el sitio real ya desplegado — en la vista previa del chat de
Claude está bloqueada por seguridad del navegador. Una vez en Netlify,
funciona normal desde cualquier celular.
