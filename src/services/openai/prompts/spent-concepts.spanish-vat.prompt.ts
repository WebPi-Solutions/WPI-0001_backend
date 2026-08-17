/**
 * Prompt de cuadre de IVA para facturas españolas.
 * No aplica a emisores extranjeros: en ese caso vat es 0 y el importe ya incluye IVA.
 */
export const spentConceptsSpanishVatPrompt = `
Cuadre de IVA SOLO si el CIF del emisor tiene prefijo ES. Si el emisor es extranjero, ignora este bloque: vat es 0 y el importe ya incluye IVA.
En facturas españolas, la base impresa suele tener 2 decimales (5,88) aunque el importe real tenga más. El IVA y el total impresos son la referencia.
Comprueba cada línea: redondear(base_price * quantity * vat / 100, 2) debe coincidir con el IVA impreso. La suma de IVAs debe coincidir con totalVAT. totalSubtotal - totalIRPF + totalVAT debe coincidir con el total impreso.
La base con decimales extra, al redondear a 2 decimales en pantalla (si el siguiente dígito es 5 o mayor, se redondea hacia arriba), DEBE seguir viéndose como la base impresa. 5.885 se vería 5.89; usa como máximo 5.884 para que se vea 5.88.
Si una base a 2 decimales no cuadra (ejemplo: 5,88 × 21% = 1,2348 → 1,23, pero la factura pone IVA 1,24 y total 7,12), NO uses 5.88 ni 5.885.
Calcula una base con 3 a 6 decimales cuyo tercer decimal sea 0-4 (ejemplo: 5.884 × 21% = 1,23564 → 1,24; en pantalla se ve 5.88 y el total 7,12). Si el histórico usa quantity=1, deja quantity=1.
Si el OCR ya muestra más de 2 decimales en el precio (por ejemplo 0.339012 €/kWh) y al redondear a 2 decimales coincide con lo impreso, usa esos decimales y no los recortes.
`.trim();
