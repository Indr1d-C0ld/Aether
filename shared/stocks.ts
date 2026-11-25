// La Borsa del Reticolo: le organizzazioni più grosse sono quotate, e il prezzo segue quello che succede loro
// davvero (cassa, reputazione, paura, scioperi, guerre). Si compra, si vende, si vende allo scoperto.
// È finzione di gioco: crediti finti, titoli finti.
export type StockRow = { id: string; ticker: string; name: string; kind: string; price: number; change: number; history: number[]; open: boolean; opensIn: number; have: number; avg: number; status: string };
export type StocksView = { rows: StockRow[]; value: number; pnl: number; fee: number; maxLong: number; maxShort: number };
export const STOCK_FEE = 0.01;
export const STOCK_MAX_LONG = 500;
export const STOCK_MAX_SHORT = 200;
/** Margine richiesto per vendere allo scoperto: metà del controvalore. */
export const STOCK_MARGIN = 0.5;
