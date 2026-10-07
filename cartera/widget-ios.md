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
8. Abre el script en Scriptable y pulsa **Play**. Debe verse la vista **mediana**. Si algo falla, aparece esa vista con el error y un aviso con el mensaje y la pila.
9. En la pantalla de inicio, el widget usa el script; iOS refresca cuando quiere (~15 min).

Si ves *Received timeout…* o un recuadro negro, vuelve a pegar este archivo y pulsa **Play**. El widget solo hace una llamada a TradingView (~2 s). Si la red no llega, muestra **datos de HH:MM**.

## Tamaños

Estilo tipo widget de Bolsa de iOS: dos líneas por valor (ticker + %, precio + cambio), sin nombres ni grupos. Orden: % del día, de mayor a menor (izquierda, luego derecha).

- **Pequeño:** hasta 4 filas × 1 columna.
- **Mediano:** 4 filas × 2 columnas (8 valores).
- **Grande:** todas las posiciones en 2 columnas (21 → 11×2), filas repartidas en toda la altura, ticker ~13 pt.

## Datos

Lee los tickers de [`data/cartera.json`](../data/cartera.json) publicado en GitHub Pages. Si cambias ese JSON y se publica, el widget usará la lista nueva en el siguiente refresco.

Cotizaciones: TradingView (sin CORS en Scriptable). Si falla, Yahoo Finance. Retraso típico ~15 min. No es asesoramiento financiero.
