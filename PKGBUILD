# Maintainer: rootLocalGhost <rootlocalghost@gmail.com>
pkgname=vivestream-next-bin
pkgver=v4.1.0
pkgrel=1
pkgdesc="A lightning-fast, natively integrated YouTube downloader and local media library."
arch=('x86_64')
url="https://github.com/rootlocalghost/ViveStream-Next"
license=('custom:BSL-1.1')

# Enforcing Intel QSV / VAAPI fallback matrix hardware dependencies and GStreamer media backends
depends=('webkit2gtk-4.1' 'gst-plugins-good' 'gst-plugins-base' 'gst-plugins-bad' 'gst-plugins-ugly' 'gst-libav' 'yt-dlp' 'ffmpeg' 'intel-media-driver' 'libva-utils')
makedepends=('binutils')
provides=('vivestream-next')
conflicts=('vivestream-next')

# Source array points directly to the release asset, letting makepkg handle downloading and caching
_tag="v4.1.0"
_ver="${_tag#v}"
source=("vivestream-next-${pkgver}.deb::${url}/releases/download/${_tag}/vivestream-next_${_ver}_amd64.deb")
sha256sums=('SKIP')

prepare() {
    cd "${srcdir}"

    msg2 "Extracting Debian package..."
    # 'ar' from binutils cleanly unpacks the .deb shell
    ar x "vivestream-next-${pkgver}.deb"

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
