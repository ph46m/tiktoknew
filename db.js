// db.js - Simulação de Banco de Dados em Memória
let users = [];
let likes = {};
let comments = {};

// Funções para manipulação de dados de usuários
const createUser = (username, password) => {
  users.push({ username, password, profile: { bio: '', avatar: '', seguidores: [], seguindo: [] }, videos: [] });
};

const getUserByUsername = (username) => {
  return users.find(u => u.username === username);
};

const updateUserProfile = (username, bio, avatar) => {
  const user = getUserByUsername(username);
  if (user) {
    if (bio !== undefined) user.profile.bio = bio;
    if (avatar !== undefined) user.profile.avatar = avatar;
  }
};

// Funções para manipulação de vídeos
const addVideoToUser = (username, videoUrl) => {
  const user = getUserByUsername(username);
  if (user && videoUrl) {
    user.videos.push(videoUrl);
  }
};

module.exports = {
  users,
  likes,
  comments,
  createUser,
  getUserByUsername,
  updateUserProfile,
  addVideoToUser,
};
