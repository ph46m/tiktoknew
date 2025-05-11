const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const FormData = require('form-data');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(''));

// Função para ler os dados dos usuários do arquivo JSON
function readUsersFromFile() {
  const data = fs.readFileSync('users.json');
  return JSON.parse(data);
}

// Função para salvar os dados dos usuários no arquivo JSON
function saveUsersToFile(users) {
  fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
}

// Função para ler dados JSON com fallback seguro
function readJsonFile(filePath) {
  try {
    const data = fs.readFileSync(filePath, { flag: 'a+' });
    return data.length > 0 ? JSON.parse(data) : {};
  } catch (err) {
    console.error(`Erro ao ler ${filePath}:`, err);
    return {};
  }
}

// Configurando o armazenamento para o multer
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ erro: 'Nenhum arquivo fornecido' });
  }

  const { username, caption } = req.body;

  if (!username) {
    return res.status(400).json({ erro: 'Username não fornecido' });
  }

  console.log('Recebendo o arquivo:', req.file);
  console.log('Username:', username);
  console.log('Caption:', caption);

  try {
    const formData = new FormData();
    formData.append('reqtype', 'fileupload');
    formData.append('fileToUpload', req.file.buffer, { filename: 'video.mp4' });

    const response = await fetch('https://catbox.moe/user/api.php', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Erro HTTP: ${response.status}`);
    }

    const videoUrl = await response.text();
    console.log('Resposta do Catbox:', videoUrl);

    if (videoUrl && !videoUrl.startsWith('error')) {
      let users = readUsersFromFile();
      const user = users.find(u => u.username === username);

      if (!user) {
        return res.status(404).json({ erro: 'Usuário não encontrado' });
      }

      user.videos = user.videos || [];
      user.videos.push({
        url: videoUrl,
        username: username,
        avatar: user.profile.avatar,
        caption: caption || 'Sem legenda',
        music: 'Música Desconhecida',
        id: Date.now().toString()
      });
      saveUsersToFile(users);

      res.json({ sucesso: true, videoUrl });
    } else {
      throw new Error(videoUrl || 'Erro ao enviar vídeo para o Catbox');
    }
  } catch (err) {
    console.error('Erro ao enviar vídeo para o Catbox:', err);
    res.status(500).json({ erro: 'Erro ao processar upload' });
  }
});

// Cadastro
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ erro: 'Dados inválidos' });
  const users = readUsersFromFile();
  if (users.find(u => u.username === username)) return res.status(400).json({ erro: 'Usuário já existe' });
  users.push({ username, password, profile: { bio: '', avatar: '', seguidores: [], seguindo: [] }, videos: [] });
  saveUsersToFile(users);
  res.json({ sucesso: true });
});

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const users = readUsersFromFile();
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ erro: 'Credenciais inválidas' });
  res.json({ sucesso: true, username });
});

// Obter dados do perfil
app.get('/api/user/:username', (req, res) => {
  const users = readUsersFromFile();
  const user = users.find(u => u.username === req.params.username);
  console.log('Buscando usuário:', req.params.username);
  if (!user) return res.status(404).json({ erro: 'Usuário não encontrado' });

  const likes = readJsonFile('likes.json');
  let totalLikes = 0;
  user.videos.forEach(video => {
    if (likes[video.id]) totalLikes += likes[video.id].length;
  });

  res.json({
    ...user,
    stats: {
      seguindo: user.profile.seguindo.length,
      seguidores: user.profile.seguidores.length,
      curtidas: totalLikes
    }
  });
});

// Seguir um usuário
app.post('/api/follow', (req, res) => {
  const { username, targetUser } = req.body;
  let users = readUsersFromFile();

  const user = users.find(u => u.username === username);
  const target = users.find(u => u.username === targetUser);

  if (!user || !target) return res.status(404).json({ erro: 'Usuário não encontrado' });

  if (!user.profile.seguindo.includes(targetUser)) {
    user.profile.seguindo.push(targetUser);
    target.profile.seguidores.push(username);
    saveUsersToFile(users);
  }

  res.json({ sucesso: true });
});

// Parar de seguir um usuário
app.post('/api/unfollow', (req, res) => {
  const { username, targetUser } = req.body;
  let users = readUsersFromFile();

  const user = users.find(u => u.username === username);
  const target = users.find(u => u.username === targetUser);

  if (!user || !target) return res.status(404).json({ erro: 'Usuário não encontrado' });

  user.profile.seguindo = user.profile.seguindo.filter(u => u !== targetUser);
  target.profile.seguidores = target.profile.seguidores.filter(u => u !== username);
  saveUsersToFile(users);

  res.json({ sucesso: true });
});

// Atualizar perfil
app.post('/atualizar-perfil', (req, res) => {
  const { username, bio, avatar } = req.body;
  console.log('Requisição para atualizar perfil recebida:', { username, bio, avatar });
  const users = readUsersFromFile();
  const user = users.find(u => u.username === username);
  if (!user) return res.status(404).json({ erro: 'Usuário não encontrado' });
  if (bio !== undefined) user.profile.bio = bio;
  if (avatar !== undefined) user.profile.avatar = avatar;
  saveUsersToFile(users);
  res.json({ sucesso: true });
});

// Curtir vídeo
app.post('/api/like', (req, res) => {
  const { videoId, username } = req.body;
  let likes = readJsonFile('likes.json');
  if (!likes[videoId]) likes[videoId] = [];
  if (!likes[videoId].includes(username)) likes[videoId].push(username);
  fs.writeFileSync('likes.json', JSON.stringify(likes, null, 2));
  res.json({ total: likes[videoId].length });
});

// Comentar vídeo
app.post('/api/comment', (req, res) => {
  const { videoId, username, text } = req.body;
  let comments = readJsonFile('comments.json');
  if (!comments[videoId]) comments[videoId] = [];
  comments[videoId].push({ user: username, text });
  fs.writeFileSync('comments.json', JSON.stringify(comments, null, 2));
  res.json({ comentarios: comments[videoId] });
});

// Obter comentários de um vídeo
app.post('/api/comments', (req, res) => {
  const { videoId } = req.body;
  const comments = readJsonFile('comments.json');
  const users = readUsersFromFile();
  const enrichedComments = (comments[videoId] || []).map(comment => {
    const user = users.find(u => u.username === comment.user);
    return {
      ...comment,
      avatar: user ? user.profile.avatar : ''
    };
  });
  res.json({ comentarios: enrichedComments });
});

// Obter vídeos de todos os usuários (usado em /api/feed)
app.get('/api/feed', (req, res) => {
  const users = readUsersFromFile();
  const allVideos = users.flatMap(user => user.videos.map(video => ({
    ...video,
    username: user.username,
    avatar: user.profile.avatar,
    no_watermark: video.url,
    title: video.caption,
    music: { title: video.music }
  })));
  res.json({ resultado: allVideos });
});

// Obter vídeos de um usuário
app.get('/api/user/:username/videos', (req, res) => {
  const users = readUsersFromFile();
  const user = users.find(u => u.username === req.params.username);
  console.log('Buscando vídeos do usuário:', req.params.username);
  if (!user) return res.status(404).json({ erro: 'Usuário não encontrado' });
  res.json({ videos: user.videos });
});

// Salvar vídeo no perfil do usuário
app.post('/api/user/add-video', (req, res) => {
  const { username, videoUrl } = req.body;
  console.log('Adicionando vídeo:', { username, videoUrl });
  let users = readUsersFromFile();
  const user = users.find(u => u.username === username);
  if (!user) return res.status(404).json({ erro: 'Usuário não encontrado' });
  if (videoUrl) {
    user.videos.push({ url: videoUrl, username: username, avatar: user.profile.avatar, caption: 'Vídeo novo', music: 'Música Desconhecida' });
    saveUsersToFile(users);
    res.json({ sucesso: true, videoUrl });
  } else {
    res.status(400).json({ erro: 'URL do vídeo não fornecida' });
  }
});

// Vídeos aleatórios da API Kamui
app.post('/api/videos', async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ erro: 'Query não fornecida' });
  try {
    console.log(`Buscando vídeos com query: ${query}`);
    const response = await fetch(`https://kamuiapi.shop/api/ferramenta/tiktok-search?query=${encodeURIComponent(query)}&apikey=dantes15s`);
    console.log('Status da resposta da API Kamui:', response.status);
    if (!response.ok) {
      throw new Error(`Erro HTTP: ${response.status} - ${await response.text()}`);
    }
    const data = await response.json();
    console.log('Dados recebidos da API Kamui:', data);
    if (data.resultado && Array.isArray(data.resultado)) {
      const filtrado = data.resultado.filter(v => v.no_watermark);
      res.json({ resultado: filtrado });
    } else {
      console.warn('Nenhum resultado válido na API Kamui, usando feed local como fallback');
      const feedVideos = await fetch(`${req.protocol}://${req.get('host')}/api/feed`);
      if (feedVideos.ok) {
        const feedData = await feedVideos.json();
        res.json(feedData);
      } else {
        throw new Error('Falha no feed local');
      }
    }
  } catch (error) {
    console.error('Erro ao buscar vídeos da API Kamui:', error.message);
    const fallbackVideos = [
      { no_watermark: 'https://www.w3schools.com/html/mov_bbb.mp4', title: 'Vídeo de Fallback 1', music: { title: 'Música de Fallback 1' } },
      { no_watermark: 'https://www.w3schools.com/html/mov_bbb.mp4', title: 'Vídeo de Fallback 2', music: { title: 'Música de Fallback 2' } }
    ];
    console.log('Usando vídeos de fallback devido ao erro');
    res.json({ resultado: fallbackVideos });
  }
});

// Nova rota para buscar usuários
app.post('/api/search/users', (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ erro: 'Query não fornecida' });
  const users = readUsersFromFile();
  const filteredUsers = users
    .filter(user => user.username.toLowerCase().includes(query.toLowerCase()))
    .map(user => ({ username: user.username }));
  res.json({ users: filteredUsers });
});

// Nova rota para pesquisa de vídeos
app.get('/search', async (req, res) => {
  const { query } = req.query;
  if (!query) return res.status(400).json({ erro: 'Query não fornecida' });
  try {
    console.log(`Buscando vídeos com query: ${query}`);
    const response = await fetch(`https://kamuiapi.shop/api/ferramenta/tiktok-search?query=${encodeURIComponent(query)}&apikey=dantes15s`);
    console.log('Status da resposta da API Kamui:', response.status);
    if (!response.ok) {
      throw new Error(`Erro HTTP: ${response.status} - ${await response.text()}`);
    }
    const data = await response.json();
    console.log('Dados recebidos da API Kamui:', data);
    if (data.resultado && Array.isArray(data.resultado)) {
      const filtrado = data.resultado.filter(v => v.no_watermark);
      res.json({ resultado: filtrado });
    } else {
      console.warn('Nenhum resultado válido na API Kamui, usando feed local como fallback');
      const feedVideos = await fetch(`${req.protocol}://${req.get('host')}/api/feed`);
      if (feedVideos.ok) {
        const feedData = await feedVideos.json();
        res.json(feedData);
      } else {
        throw new Error('Falha no feed local');
      }
    }
  } catch (error) {
    console.error('Erro ao buscar vídeos da API Kamui:', error.message);
    const fallbackVideos = [
      { no_watermark: 'https://www.w3schools.com/html/mov_bbb.mp4', title: 'Vídeo de Fallback 1', music: { title: 'Música de Fallback 1' } },
      { no_watermark: 'https://www.w3schools.com/html/mov_bbb.mp4', title: 'Vídeo de Fallback 2', music: { title: 'Música de Fallback 2' } }
    ];
    console.log('Usando vídeos de fallback devido ao erro');
    res.json({ resultado: fallbackVideos });
  }
});

// Rota para servir o index.html na raiz
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
// Rota para servir o index.html na raiz
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});
// Rota para servir o index.html na raiz
app.get('/registro', (req, res) => {
  res.sendFile(path.join(__dirname, 'register.html'));
});
// Rota para servir o index.html na raiz
app.get('/src', (req, res) => {
  res.sendFile(path.join(__dirname, 'search.html'));
});
// Rota para servir o index.html na raiz
app.get('/perfil', (req, res) => {
  res.sendFile(path.join(__dirname, 'profile.html'));
});




app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
