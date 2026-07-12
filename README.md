# Casper Peters — portfolio

Publieke persoonlijke portfoliosite van Casper Peters: applied physicist, systems builder en ASML Competence Engineer uit Eindhoven.

**Live:** <https://casperpeters.github.io/cp-neural-portfolio/>

## Cases

- Neurophysics — recurrent temporal Restricted Boltzmann Machines voor whole-brain zebravisdata.
- Bridgetafel — interactief leerproduct voor bridgebeginners.
- MigratieMonitor — live CBS-migratiedata als transparant dataproduct.

## Lokaal draaien

```bash
python -m http.server 4173 --bind 127.0.0.1
```

Open <http://127.0.0.1:4173>.

## Interactie en toegankelijkheid

- Cursorbeweging en klikken activeren het neural/silicon-signaal.
- `Pause signal` stopt de animatie.
- `prefers-reduced-motion`, toetsenbordfocus en een skiplink worden ondersteund.
- Responsive getest op 320, 390, 768 en 1280 pixels.
