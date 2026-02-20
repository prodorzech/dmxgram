# DMXGram

Pełna aplikacja do czatowania w stylu Discord/Messenger z real-time messaging.

## Funkcje

- 💬 Real-time messaging z WebSocket (Socket.io)
- 🖥️ Serwery i kanały (jak Discord)
- 👤 System użytkowników z autentykacją
- 🎨 Ciemny i jasny motyw
- 📱 Responsywny design
- ⚡ Szybki i nowoczesny stack (React + TypeScript + Node.js)

## Technologie

### Frontend
- React 18 + TypeScript
- Vite
- Socket.io Client
- Zustand (state management)
- React Router
- Lucide Icons

### Backend
- Node.js + Express
- Socket.io
- TypeScript
- JWT Authentication
- bcryptjs

## Instalacja

1. Zainstaluj wszystkie zależności:
```bash
npm run install-all
```

2. Skonfiguruj zmienne środowiskowe:
```bash
cd server
cp .env.example .env
# Edytuj .env i ustaw własny JWT_SECRET
```

3. Uruchom aplikację w trybie deweloperskim:
```bash
npm run dev
```

Aplikacja będzie dostępna na:
- Frontend: http://localhost:3000
- Backend: http://localhost:3001

## Build produkcyjny

```bash
npm run build
npm start
```

## Struktura projektu

```
DMXGram/
├── client/          # Frontend React
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── store/
│   │   ├── types/
│   │   └── styles/
│   └── package.json
├── server/          # Backend Node.js
│   ├── src/
│   │   ├── routes/
│   │   ├── socket/
│   │   ├── middleware/
│   │   └── types/
│   └── package.json
└── package.json
```

## Użycie

1. Zarejestruj nowe konto
2. Zaloguj się
3. Stwórz nowy serwer lub dołącz do istniejącego
4. Utwórz kanały tekstowe
5. Zacznij czatować w czasie rzeczywistym!

## Licencja

MIT
