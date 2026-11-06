// Every named export is a capability. Do not export unsupported features or
// internal utilities: MyGo Music uses these names to decide what UI to show.
export { account, setSetting, signIn, signOut } from "./auth.js";
export { album, artist, browse, home, search } from "./library.js";
export { followArtist, isLiked, like, liked, played, saveAlbum, savedAlbums } from "./favorites.js";
export { addToPlaylist, createPlaylist, deletePlaylist, movePlaylistTrack, playlist, playlists, removeFromPlaylist, renamePlaylist } from "./playlists.js";
export { stream } from "./playback.js";
export { lyrics } from "./lyrics.js";
