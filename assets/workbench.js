(() => {
  const film = document.querySelector('#landscape-film');
  const music = document.querySelector('#background-music');
  if (!film || !music) return;

  // A first interaction can start the homepage soundtrack. Keep narration clear
  // even when that delayed play request resolves after the film starts.
  const protectNarration = () => {
    if (!film.paused && !film.muted && film.volume > 0) music.pause();
  };
  film.addEventListener('play', protectNarration);
  film.addEventListener('volumechange', protectNarration);
  music.addEventListener('play', protectNarration);
})();
