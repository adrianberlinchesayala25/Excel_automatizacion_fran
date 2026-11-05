# Facturación de vehículos

Aplicación Astro con SSR en Vercel para generar y descargar facturas desde una plantilla privada.

## Configuración

1. Copia `.env.example` a `.env` y rellena `APP_PASSWORD_HASH` y `APP_SESSION_SECRET`.
2. Ejecuta `npm install` y `npm run dev`.
3. En Vercel, configura las mismas variables antes de desplegar.

Genera un hash para otra contraseña con `node --input-type=module -e "import { pbkdf2Sync, randomBytes } from 'node:crypto'; const salt = randomBytes(16); console.log(Buffer.concat([salt, pbkdf2Sync(process.argv[1], salt, 310000, 32, 'sha256')]).toString('base64'))" "tu contraseña"`. Genera `APP_SESSION_SECRET` con `node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(32).toString('base64'))"`.

El login bloquea una dirección tras 3 contraseñas incorrectas durante 15 minutos. En Vercel el contador está en memoria por instancia; para que el límite sea compartido entre todas las instancias hace falta un almacén persistente.

La plantilla está en `src/data/plantilla.xlsx`, fuera de los archivos públicos, porque parte de una factura real. El navegador recuerda los campos del formulario en `localStorage`; «Borrar datos guardados» los elimina de ese dispositivo.

## Comprobación

`npm run check:template` comprueba el mapeo de celdas, que los estilos de la plantilla se conservan y que las sesiones no se pueden falsificar.