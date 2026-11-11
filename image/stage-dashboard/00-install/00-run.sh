#!/bin/bash -e
# Zet het dashboard in de image en voer de installer uit in de chroot.
# De workflow kopieert het project vooraf naar files/.
install -d "${ROOTFS_DIR}/opt/pi-dashboard"
cp -a files/. "${ROOTFS_DIR}/opt/pi-dashboard/"

on_chroot << CHROOT
bash /opt/pi-dashboard/install.sh --image
ln -sf /usr/share/zoneinfo/Europe/Amsterdam /etc/localtime
echo Europe/Amsterdam > /etc/timezone
CHROOT
