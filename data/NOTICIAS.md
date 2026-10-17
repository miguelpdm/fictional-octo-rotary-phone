# Noticias interesantes

Lista curada para la sección **Noticias interesantes** de `/cartera/#noticias`.

No pongas aquí cantidades, precios de la cartera ni comentarios privados. Solo titular público, enlace y un `porque` corto.

## Archivo

Edita [`noticias.json`](./noticias.json). Es un array JSON de objetos.

Puedes **añadir al principio, al final o en medio**. La página ordena por `fecha` (más reciente primero) y, a empate, por `ticker`.

## Campos

| Campo | Tipo | Obligatorio | Notas |
| --- | --- | --- | --- |
| `fecha` | `YYYY-MM-DD` | sí | Día de la noticia (no la hora). |
| `ticker` | string | sí | Símbolo corto, como en la cartera (`ASST`, `HUMA`, `UMG`, `SLVR.DE`…). Se usa en los chips. |
| `tipo` | `duro` o `soft` | sí | `duro` = 🔴 hecho que mueve tesis (OPV, adopción, junta, guía). `soft` = 🟡 contexto (regulación, organigrama, congreso). |
| `titular` | string | sí | En español, una línea. |
| `url` | https | sí | Enlace a la fuente. Se abre en pestaña nueva. |
| `porque` | string | sí | En español, 1–2 frases: por qué importa para ese ticker. Sin cifras de la cartera. |
| `fuente` | string | no | Nombre del medio, p. ej. `GlobeNewswire`, `SEC`, `LiveMint`, `LA Times`, `PR Newswire`, `CoinDesk`, `Cablefax`, `Yahoo`. Se muestra junto al idioma. Si falta, se omite. |
| `idioma` | ISO 639-1 | no | Código de idioma en **mayúsculas**: `ES`, `EN`, `FR`, `IT`, `NL`, `DE`… Se usa en el filtro de idioma. Si falta, la ficha sigue visible y no entra en ningún chip de idioma. |

## Ejemplo

```json
{
  "fecha": "2026-10-16",
  "ticker": "ASST",
  "tipo": "duro",
  "titular": "Strive fija el precio de la OPV ampliada de SATS",
  "url": "https://www.example.com/noticia",
  "porque": "Más capital para bitcoin y más dilución: cambia el mapa de ASST.",
  "fuente": "GlobeNewswire",
  "idioma": "EN"
}
```

La ficha muestra una etiqueta pequeña tipo `GlobeNewswire · EN`.

## Cómo añadir una entrada

1. Abre `data/noticias.json`.
2. Copia un objeto y rellena los campos. `fuente` e `idioma` son opcionales pero conviene ponerlos.
3. No hace falta ordenar el array.
4. Comprueba comas del JSON (sin coma final).
5. Recarga `/cartera/#noticias`. El chip del ticker (y el de idioma, si hay `idioma`) aparece solo si hay al menos una noticia con ese valor.
