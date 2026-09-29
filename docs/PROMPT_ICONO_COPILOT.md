# Prompt para pedir el icono de Hypro a Copilot (o cualquier IA de imágenes)

Hypro ya tiene un icono generado (`public/icons/logo.svg` + los PNG). Si quieres una
versión alternativa más elaborada hecha por una IA de imágenes, usa uno de estos
prompts. **Importante:** pide siempre **fondo transparente** o **fondo exactamente
`#0a0a0c`** (el fondo de la app), y formato **cuadrado**.

---

## Prompt recomendado (en inglés, funciona mejor con generadores de imágenes)

```
App icon for a gym/hypertrophy workout tracker named "Hypro".
Minimal, modern, flat vector style. A bold letter "H" that doubles as a
weightlifting barbell: two vertical posts with small weight plates top and
bottom, and a central crossbar angled upward to suggest progress/gains.
Color: electric orange (#ff6a00 to #ff8c3a gradient).
Background: solid dark near-black (#0a0a0c), square, rounded corners.
No text, no letters other than the H shape, no gradients on the background,
high contrast, crisp at small sizes. Centered, with safe margin around the icon.
Output 512x512 PNG.
```

## Variante con fondo transparente

```
Same as above but with a fully transparent background (PNG with alpha),
just the orange "H barbell" mark centered with padding. 512x512.
```

## Versión en español (si usas Copilot en español)

```
Icono de app para un tracker de gimnasio/hipertrofia llamado "Hypro".
Estilo vectorial plano, minimalista y moderno. Una letra "H" en negrita que
también parece una barra de pesas: dos postes verticales con pequeños discos
arriba y abajo, y una barra central inclinada hacia arriba que sugiere progreso.
Color naranja eléctrico (degradado #ff6a00 a #ff8c3a).
Fondo negro casi puro sólido (#0a0a0c), cuadrado, esquinas redondeadas.
Sin texto salvo la forma de la H, alto contraste, nítido en tamaño pequeño,
centrado con margen de seguridad. Salida PNG 512x512.
```

---

## Después de generarlo

1. Guarda el PNG como `public/icons/icon-512.png` (y una versión 192 como `icon-192.png`).
2. Si el generador solo da 512, puedes regenerar los tamaños con:
   ```bash
   npm run icons
   ```
   (pero ese script parte del SVG; si usas una imagen externa, reemplaza los PNG
   directamente o adapta el script).
3. Colores del tema para mantener coherencia:
   - Fondo app: `#0a0a0c`
   - Naranja acento: `#ff6a00` (claro `#ff8c3a`)
