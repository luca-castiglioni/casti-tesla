export interface Profilo {
  id: string
  email: string
  nome: string | null
  is_admin: boolean
}

export interface Impostazioni {
  km_iniziali: number
  kwh_iniziali: number
  data_inizio: string // AAAA-MM-GG: giorno di installazione dello Shelly
}

export interface Prezzo {
  id: string
  valido_dal: string
  euro_kwh: number
}

export interface LetturaKm {
  id: string
  data: string
  km: number
  created_by: string | null
  fonte: 'manuale' | 'tesla'
}

export interface RicaricaEsterna {
  id: string
  data: string // AAAA-MM-GG
  tipo: 'supercharger' | 'altra'
  luogo: string | null
  kwh: number | null // facoltativo: a volte si conosce solo l'importo
  euro: number
  fonte: 'manuale' | 'tesla'
  created_by: string | null
}

export interface StatoTesla {
  ultimo_km: string | null
  ultimo_storico: string | null
  ultimo_errore: string | null
  ultimo_errore_ts: string | null
}

export interface ConsumoGiorno {
  giorno: string
  kwh: number
}

export interface Ricarica {
  inizio: string // timestamp ISO
  fine: string
  kwh: number
  potenza_max_w: number
}

export interface LetturaShelly {
  ts: string
  totale_wh: number
  potenza_w: number
  tensione: number | null
}

export interface Dati {
  impostazioni: Impostazioni
  prezzi: Prezzo[]
  km: LetturaKm[]
  giorni: ConsumoGiorno[]
  ricariche: Ricarica[]
  esterne: RicaricaEsterna[]
  ultima: LetturaShelly | null
  tesla: StatoTesla | null
}
