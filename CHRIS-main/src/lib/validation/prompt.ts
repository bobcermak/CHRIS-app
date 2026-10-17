import { z } from 'zod'

/** Project prompt on 01 Zadání. */
export const promptSchema = z
  .string()
  .trim()
  .min(20, 'Popište projekt alespoň jednou větou: cíl, metodu nebo co vám chybí.')
  .max(4000, 'Zadání je příliš dlouhé. Zkraťte ho prosím pod 4 000 znaků.')
