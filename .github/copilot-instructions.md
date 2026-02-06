# BarberShop Agendamento - AI Coding Instructions

## Project Overview
This is a **dual-interface barbershop booking system** with client and admin modules. Currently client-side only (frontend); Python backend integration is planned at `http://127.0.0.1:5000`.

**Key Files:**
- Client: [index.html](../index.html), [app.js](../app.js)
- Admin: [admin.html](../admin.html), [admin-app.js](../admin-app.js)
- Styles: [style.css](../style.css)

---

## Architecture & Data Flow

### Client-Side (index.html + app.js)
1. **Login Screen** → Collects customer name and WhatsApp number
2. **Booking Panel** → User selects:
   - Service (from admin-managed list)
   - Date (next 12 days in `DD/MM` format)
   - Time (8 fixed slots: 09:00-18:00)
   - Payment method (Cash or Pix)
3. **Confirmation Screen** → Shows success + WhatsApp notification option

**State Management:** Uses `localStorage`:
- `usuarioLogado`: Current logged-in user object
- `listaServicos`: Services synced from admin
- `agendamentosAdmin`: All bookings (temporary storage)

### Admin Dashboard (admin.html + admin-app.js)
Three tabs:
- **Agenda**: Shows next bookings, mark as complete (moves to transactions)
- **Serviços**: Create/delete services (syncs to client list)
- **Caixa**: Financial summary by payment method + daily goal tracking (R$ 300)

**Key Feature:** Completing a service moves it from `agendamentosAdmin` to `transacoes` array.

---

## Critical Patterns & Conventions

### UI Selection Pattern
Services, dates, and time slots use a **toggle selection** class:
```javascript
// Deselect all, then add 'selecionado' class to chosen element
document.querySelectorAll('.selector').forEach(el => el.classList.remove('selecionado'));
el.classList.add('selecionado');
```
Apply this same pattern to new selectable elements.

### Data Synchronization
- **Single Source:** Admin creates services → stored in `localStorage['listaServicos']`
- **Client reads:** `app.js` loads this list on page open
- **Booking Flow:** Data accumulates in `agendamentoLocal` object, then pushed to `localStorage['agendamentosAdmin']`
- **No refresh needed** between pages; use tab switching in admin

### Currency & Formatting
- All prices: `parseFloat()` for calculations, `.toFixed(2)` for display
- Dates: `DD/MM` format only (no year)
- WhatsApp links: Use URL template with `encodeURIComponent()`

### CSS Theme
Golden/dark theme via CSS variables (see [style.css](../style.css#L1-L7)):
- `--primary: #d4af37` (gold for highlights)
- `--bg: #0a0a0a` (black)
- `--success: #28a745` (green)
- All inputs use `background: #000` with `border: 1px solid #333`

---

## Backend Integration Points

When Python backend launches:
1. **Uncomment fetch in** [confirmarAgendamento()](../app.js#L74-L79)
2. **POST to** `http://127.0.0.1:5000/agendamentos`
3. **Expected payload:**
   ```json
   {
     "nome": "João",
     "tel": "11999999999",
     "servico": "Corte Social",
     "valor": 35.00,
     "dia": "15/02",
     "hora": "14:00",
     "pagamento": "Pix",
     "id": 1739878293847
   }
   ```
4. Remove `localStorage` fallback once API confirmed working

---

## Developer Workflows

### Adding a Feature
1. **Client booking UI:** Add to [tela-agendamento section](../index.html#L27-L50)
2. **Sync to admin?** Update [admin.html tab-agenda](../admin.html#L27-L45)
3. **New selection?** Use the **UI Selection Pattern** above
4. **New data field?** Add to `agendamentoLocal` object, include in POST payload

### Testing Workflows
- **LocalStorage persistence:** Open DevTools → Application → LocalStorage
- **Clear data:** `localStorage.clear()` in console
- **View stored bookings:** `JSON.parse(localStorage.getItem('agendamentosAdmin'))`
- **WhatsApp preview:** Copy generated URL to browser manually

---

## Common Pitfalls to Avoid

- ❌ Hardcoding service list in both files → Keep single source in admin-app.js
- ❌ Forgetting `encodeURIComponent()` on WhatsApp messages → Special chars break URL
- ❌ Using `location.reload()` in async flows → Can cause data loss; use tab toggle instead
- ❌ Not converting prices to numbers before math → String + Number = concatenation
- ❌ Modifying CSS color variables without testing dark contrast → Verify text readability

---

## File Dependencies

```
index.html
  ├─ style.css (global theme, client layout)
  ├─ app.js (client logic, localStorage access)
  └─ listaServicos (reads from admin-app.js via localStorage)

admin.html
  ├─ style.css (global theme, admin layout)
  └─ admin-app.js (admin logic, syncs listaServicos)
```

No external APIs in use except WhatsApp URL scheme.
