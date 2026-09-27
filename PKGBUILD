# Maintainer: rootLocalGhost <rootlocalghost@gmail.com>
pkgname=vivestream-next-bin
pkgver=latest
pkgrel=1
pkgdesc="A lightning-fast, natively integrated YouTube downloader and local media library."
arch=('x86_64')
url="https://github.com/rootlocalghost/ViveStream-Next"
license=('custom:BSL-1.1')

# Enforcing Intel QSV / VAAPI fallback matrix hardware dependencies and GStreamer media backends
depends=('webkit2gtk-4.1' 'gst-plugins-good' 'gst-plugins-base' 'gst-plugins-bad' 'gst-plugins-ugly' 'gst-libav' 'yt-dlp' 'ffmpeg' 'intel-media-driver' 'libva-utils')
makedepends=('curl' 'jq' 'binutils')
provides=('vivestream-next')
conflicts=('vivestream-next')

# Source and checksums must be empty to allow dynamic fetching in prepare()
source=()
sha256sums=()

prepare() {
    msg "Querying GitHub API for the latest release..."
    
    # Fetch the latest tag dynamically
    LATEST_TAG=$(curl -s "https://api.github.com/repos/rootlocalghost/ViveStream-Next/releases/latest" | jq -r .tag_name)
    
    if [ "$LATEST_TAG" = "null" ] || [ -z "$LATEST_TAG" ]; then
        error "Failed to fetch the latest version from GitHub. Check your network or rate limits."
        exit 1
    fi
    
    # Strip the 'v' prefix for the .deb filename mapping
    LATEST_VER="${LATEST_TAG#v}"
    msg2 "Latest release found: ${LATEST_TAG}"
    
    DEB_URL="${url}/releases/download/${LATEST_TAG}/vivestream-next_${LATEST_VER}_amd64.deb"
    
    msg2 "Downloading payload: ${DEB_URL}"
    curl -L -o "${srcdir}/vivestream-next.deb" "${DEB_URL}"
    
    msg2 "Extracting Debian package..."
    # 'ar' from binutils cleanly unpacks the .deb shell
    ar x "${srcdir}/vivestream-next.deb"
    
    msg2 "Unpacking data archive..."
    # Extracts whichever data.tar format Tauri generated (.gz, .xz, or .zst)
    tar -xf data.tar.* -C "${srcdir}"
}

package() {
    msg2 "Mapping extracted filesystem to Arch pkgdir..."
    
    # The .deb data.tar extraction creates a 'usr/' directory in $srcdir.
    # We simply copy that entire structure (binaries, desktop files, and icons) into $pkgdir.
    cp -r "${srcdir}/usr" "${pkgdir}/"

    # Ensure the binary has strict executable permissions
    chmod 755 "${pkgdir}/usr/bin/vivestream-next"
}