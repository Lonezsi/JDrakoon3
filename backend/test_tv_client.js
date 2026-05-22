const { io } = require('socket.io-client');
const s = io('http://localhost:3001', { transports: ['websocket'] });

s.on('connect', () => console.log('tv connect', s.id));

s.on('connect', () => {
	console.log('tv connect', s.id);
	s.emit('join', { name: 'TVVIEW', deviceType: 'tv' }, (res) => {
		console.log('tv join res', res);
	});
});

s.on('lobby_state', (p) => console.log('tv lobby_state', JSON.stringify(p).slice(0,200)));
s.on('player_joined', (p) => console.log('tv player_joined', JSON.stringify(p)));

setInterval(() => {}, 1000000);
