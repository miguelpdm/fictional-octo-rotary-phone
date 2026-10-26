# Prensa

Resumen de prensa diario de Miguel. Página pública: [`/prensa/`](../prensa/) (`https://miguelpdm.github.io/fictional-octo-rotary-phone/prensa/`).

GitHub Pages no lista directorios. Por eso hay un índice de fechas además de un JSON por día.

## Archivos

| Archivo | Qué es |
| --- | --- |
| [`prensa/index.json`](./prensa/index.json) | Array de fechas `AAAA-MM-DD`, **más reciente primero**. La página carga la primera si no hay `?d=`. |
| [`prensa/AAAA-MM-DD.json`](./prensa/) | Una edición. El nombre del archivo debe coincidir con el campo `fecha`. |

No subas JSON de prueba. Si no hay ediciones, deja `index.json` en `[]`.

## Formato de una edición

```json
{
  "fecha": "2026-10-22",
  "secciones": [
    {
      "nombre": "España",
      "items": [
        {
          "titular": "Titular en español",
          "url": "https://www.example.com/noticia",
          "fuente": "El País",
          "nota": "Opcional. Una línea de contexto."
        }
      ]
    }
  ]
}
```

### Campos

| Campo | Obligatorio | Notas |
| --- | --- | --- |
| `fecha` | sí | `AAAA-MM-DD`, igual que el nombre del archivo. |
| `secciones` | sí | Array. La página las muestra en el orden canónico (abajo). |
| `secciones[].nombre` | sí | Una de las cinco secciones. |
| `secciones[].items` | sí | Puede estar vacío. |
| `items[].titular` | sí | Texto del enlace. |
| `items[].url` | sí | `https://…`, se abre en pestaña nueva. |
| `items[].fuente` | sí | Nombre del medio. |
| `items[].nota` | no | Si falta, no se pinta. |

### Secciones (orden fijo en la página)

1. España
2. Internacional
3. Economía y mercados
4. Tecnología e IA
5. IA en X

Si una sección no viene en el JSON, no se muestra. Si llega un nombre extra, va al final.

## Retención (últimos 7 días)

El archivo solo guarda **los últimos 7 días**. Al añadir una edición con fecha `F`:

1. Borra todo `data/prensa/AAAA-MM-DD.json` cuya fecha sea **anterior a `F − 6 días`**.
2. Quita esas fechas de `data/prensa/index.json`.

Ejemplo: al añadir `2026-10-26` se conservan desde `2026-10-20` (incluido) y se borra `2026-10-19` y anteriores. Si no hay nada más viejo que esa cota, no se borra nada.

## Cómo añadir una edición

1. Crea `data/prensa/AAAA-MM-DD.json` con la fecha del día y las secciones.
2. Añade `"AAAA-MM-DD"` **al principio** de `data/prensa/index.json` (más reciente primero).
3. Aplica la retención de 7 días (arriba).
4. Comprueba comas del JSON (sin coma final).
5. Recarga `/prensa/` o abre `/prensa/?d=AAAA-MM-DD`.

Ejemplo de índice con dos días:

```json
[
  "2026-10-23",
  "2026-10-22"
]
```

## URL

- `/prensa/` — última fecha del índice.
- `/prensa/?d=2026-10-22` — esa edición, si está en el índice y existe el archivo.
