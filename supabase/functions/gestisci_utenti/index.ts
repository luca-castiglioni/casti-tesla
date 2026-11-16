// Gestione degli utenti dall'app (solo l'amministratore).
// Azioni (campo "azione" nel corpo della richiesta):
//   crea   { email, password, nome }  → crea l'utente già confermato
//   elimina { id }                    → elimina l'utente (non sé stessi, non chi ha inserito dati)
//   admin  { id, is_admin }           → rende o toglie amministratore (non a sé stessi)
// Serve la chiave di servizio (solo qui, mai nell'app): per questo è una Edge Function.
import '@supabase/functions-js/edge-runtime.d.ts'
import { withSupabase } from '@supabase/server'

function errore(messaggio: string, status = 400): Response {
  return Response.json({ errore: messaggio }, { status })
}

export default {
  fetch: withSupabase({ auth: 'user', errors: { detailed: false } }, async (req, ctx) => {
    const admin = ctx.supabaseAdmin
    const io = ctx.userClaims!.id

    const { data: profilo } = await admin.from('profiles').select('is_admin').eq('id', io).maybeSingle()
    if (!profilo?.is_admin) return errore("Solo l'amministratore può gestire gli utenti.", 403)

    const corpo = await req.json().catch(() => ({}))

    if (corpo.azione === 'crea') {
      const email = String(corpo.email ?? '').trim().toLowerCase()
      const password = String(corpo.password ?? '')
      const nome = String(corpo.nome ?? '').trim()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return errore('Email non valida.')
      if (password.length < 6) return errore('La password deve avere almeno 6 caratteri.')

      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
      if (error) {
        if (/already|registered|exists/i.test(error.message)) return errore('Esiste già un utente con questa email.', 409)
        return errore('Impossibile creare l\'utente: ' + error.message, 500)
      }
      // il profilo lo crea il trigger del database; qui aggiungo il nome
      if (nome) await admin.from('profiles').update({ nome }).eq('id', data.user.id)
      return Response.json({ ok: true })
    }

    if (corpo.azione === 'elimina') {
      const id = String(corpo.id ?? '')
      if (id === io) return errore('Non puoi eliminare te stesso.')
      for (const tabella of ['km', 'prezzi']) {
        const { count } = await admin.from(tabella).select('id', { count: 'exact', head: true }).eq('created_by', id)
        if (count) return errore('Questo utente ha inserito dei dati (km o prezzi): eliminali prima, poi riprova.', 409)
      }
      const { error } = await admin.auth.admin.deleteUser(id)
      if (error) return errore('Impossibile eliminare l\'utente: ' + error.message, 500)
      return Response.json({ ok: true })
    }

    if (corpo.azione === 'admin') {
      const id = String(corpo.id ?? '')
      if (id === io) return errore('Non puoi cambiare il tuo ruolo.')
      const { error } = await admin.from('profiles').update({ is_admin: Boolean(corpo.is_admin) }).eq('id', id)
      if (error) return errore('Modifica non riuscita: ' + error.message, 500)
      return Response.json({ ok: true })
    }

    return errore('Azione sconosciuta.')
  }),
}
