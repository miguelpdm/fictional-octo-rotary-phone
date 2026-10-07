# Widget iOS (Scriptable)

Widget de la cartera para la pantalla de inicio. Es gratis con la app [Scriptable](https://apps.apple.com/app/scriptable/id1405459188). Toca el widget para abrir la web.

## Instalación

1. Instala **Scriptable** desde la App Store.
2. Abre Scriptable → **+** (script nuevo).
3. Borra el contenido de ejemplo y pega el archivo [`widget-scriptable.js`](./widget-scriptable.js) entero (también puedes copiarlo desde GitHub: vista *Raw*).
4. Nombre sugerido: `Cartera`. Guarda.
5. En la pantalla de inicio de iOS: mantén pulsado el fondo → **Añadir widget** (botón +) → busca **Scriptable**.
6. Elige el tamaño (**pequeño**, **mediano** o **grande**) y pulsa **Añadir widget**.
7. Mantén pulsado el widget → **Editar widget**:
   - **Script:** `Cartera`
   - **When Interacting:** Open App (o deja el valor por defecto; el widget ya abre la web al tocarlo)
8. Abre el script en Scriptable y pulsa **Play** una vez (previsualiza el widget y guarda cotizaciones en caché).
9. Listo. iOS refresca cuando quiere; el script pide unos **15 minutos**.

Si el widget de la pantalla de inicio muestra *Received timeout when running script*, vuelve a pegar este archivo (versión con timeout corto y caché) y pulsa **Play** en Scriptable. El widget no puede encadenar varias peticiones lentas: usa la lista embebida + una llamada a TradingView (≈2 s). Si la red no llega a tiempo, muestra **datos de HH:MM** de la última vez que funcionó.

## Tamaños

- **Pequeño:** cuántos suben/bajan, mejor y peor del día.
- **Mediano:** los 6 mayores movimientos (por |%|).
- **Grande:** filas agrupadas por P0 / P1 / P2, ordenadas por % del día.

## Datos

Lee los tickers de [`data/cartera.json`](../data/cartera.json) publicado en GitHub Pages. Si cambias ese JSON y se publica, el widget usará la lista nueva en el siguiente refresco.

Cotizaciones: TradingView (sin CORS en Scriptable). Si falla, Yahoo Finance. Retraso típico ~15 min. No es asesoramiento financiero.
