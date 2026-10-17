# Toca la melodía

App estática para tocar una melodía **nota a nota** con un botón grande. Cada toque avanza a la siguiente nota (o acorde) de la canción. Si tocas rápido, la melodía avanza rápido; si tocas despacio, avanza despacio.

No hace falta instalar nada ni compilar. Abre los archivos con cualquier servidor HTTP local (los módulos ES no se cargan bien como `file://` en algunos navegadores).

## Cómo previsualizarla

Desde la carpeta del proyecto:

```bash
python3 -m http.server 43187
```

Luego abre `http://127.0.0.1:43187` en el teléfono o en las herramientas de dispositivo del navegador (390×844 va bien).

## Uso

1. Pulsa **Canciones** y elige una melodía de la lista, o **Cargar MIDI** y elige un `.mid` / `.midi`.
2. Si el MIDI tiene varias pistas con notas, aparece el selector **Pista**.
3. Toca el círculo grande. El primer toque también desbloquea el audio (necesario en iOS Safari).
4. **Reiniciar** vuelve a la primera nota. Al terminar, el siguiente toque vuelve al principio (bucle).
5. La última canción incluida que elegiste se guarda en `localStorage` (`tap-melody-last-song`).

La interfaz está en español y está pensada para pulgar: el botón ocupa casi toda la pantalla.

## Canciones incluidas

Melodías clásicas reconocibles, en versión solo-melodía (el ritmo lo marcas tú). Las **composiciones son de dominio público**. Las listas de notas son **transcripciones originales** hechas para esta app (no se reutilizan partituras ni archivos MIDI de terceros).

| Canción | Compositor |
| --- | --- |
| Himno de la alegría | Ludwig van Beethoven |
| Para Elisa | Ludwig van Beethoven |
| Pequeña serenata nocturna | Wolfgang Amadeus Mozart |
| Marcha turca | Wolfgang Amadeus Mozart |
| Can-can | Jacques Offenbach |
| En la gruta del rey de la montaña | Edvard Grieg |
| La primavera | Antonio Vivaldi |
| Canon en Re | Johann Pachelbel |
| Marcha nupcial | Felix Mendelssohn |
| Danubio azul | Johann Strauss II |
| Habanera (Carmen) | Georges Bizet |
| Canción de cuna | Johannes Brahms |

## Formato JSON de una canción

Un archivo en `songs/` es un objeto con identificador, nombre, compositor y una lista ordenada de eventos. Cada evento es **un toque**. Si varias notas deben sonar a la vez (acorde), van juntas en `pitches`.

```json
{
  "id": "ejemplo",
  "name": "Nombre de la canción",
  "composer": "Nombre del compositor",
  "events": [
    { "pitches": [60] },
    { "pitches": [64, 67, 71] }
  ]
}
```

- `pitches`: números MIDI (60 = do central).
- El orden de `events` es el orden de los toques. No hay tempo: el ritmo lo marca quien toca.
- Los MIDI se agrupan igual: notas con el mismo instante de inicio forman un solo toque.

## Audio

El tono se sintetiza en el navegador con la Web Audio API (seno + triángulo suave y una envolvente corta). Los toques rápidos pueden solaparse; cada nota decae por su cuenta.

## Privacidad

Todo corre en el navegador. Los MIDI no se suben a ningún servidor. No despliegues esta carpeta en un sitio público si no quieres exponer tus archivos.
