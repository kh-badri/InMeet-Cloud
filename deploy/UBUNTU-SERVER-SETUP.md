# Panduan Hardening & Setup Ubuntu Server untuk BackupVault

Panduan resmi deployment produksi untuk server Ubuntu 24.04 LTS / 22.04 LTS sesuai standar keamanan PRD Bagian 8 & 13.

---

## 1. Hardening SSH & Akses Remote
Nonaktifkan login password dan akses root secara langsung. Gunakan kunci kriptografis Ed25519:

```bash
# Generate key di komputer lokal jika belum ada:
ssh-keygen -t ed25519 -C "admin@backupvault"

# Salin public key ke server:
ssh-copy-id -i ~/.ssh/id_ed25519.pub user@IP_SERVER

# Edit /etc/ssh/sshd_config:
sudo nano /etc/ssh/sshd_config
```
Tambahkan konfigurasi berikut:
```ini
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
X11Forwarding no
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
```
Restart SSH:
```bash
sudo systemctl restart ssh
```

---

## 2. Firewall (UFW)
Hanya buka port yang benar-benar dibutuhkan:
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh comment 'SSH Access'
sudo ufw allow 80/tcp comment 'HTTP (Let\'s Encrypt)'
sudo ufw allow 443/tcp comment 'HTTPS BackupVault'
sudo ufw enable
sudo ufw status verbose
```

---

## 3. Pencegahan Brute Force (Fail2ban)
```bash
sudo apt update && sudo apt install -y fail2ban
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
sudo nano /etc/fail2ban/jail.local
```
Konfigurasi jail:
```ini
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
port    = ssh
```
Restart Fail2ban:
```bash
sudo systemctl restart fail2ban
sudo fail2ban-client status sshd
```

---

## 4. Enkripsi Partisi Storage dengan LUKS
Sesuai rekomendasi PRD Bagian 8.2 & 13.2, volume data cadangan wajib disimpan di disk terenkripsi LUKS:

```bash
# 1. Format disk data (misal /dev/sdb atau volume terpisah):
sudo cryptsetup luksFormat --type luks2 --cipher aes-xts-plain64 --key-size 512 /dev/sdb

# 2. Buka partisi terenkripsi:
sudo cryptsetup open /dev/sdb backupvault_crypt

# 3. Format filesystem ext4:
sudo mkfs.ext4 -m 1 /dev/mapper/backupvault_crypt

# 4. Mount ke direktori storage:
sudo mkdir -p /var/backupvault/storage
sudo mount /dev/mapper/backupvault_crypt /var/backupvault/storage

# 5. Atur kepemilikan non-root:
sudo chown -R backupvault:backupvault /var/backupvault/storage
sudo chmod 750 /var/backupvault/storage
```

---

## 5. Sinkronisasi Waktu (Chrony) & Timezone
Penting agar waktu scheduler retensi dan token 2FA TOTP selalu sinkron:
```bash
sudo timedatectl set-timezone Asia/Jakarta
sudo apt install -y chrony
sudo systemctl restart chrony
chronyc tracking
```

---

## 6. Patch Keamanan Otomatis (Unattended-Upgrades)
```bash
sudo apt install -y unattended-upgrades update-notifier-common
sudo dpkg-reconfigure -plow unattended-upgrades
```
Pastikan file `/etc/apt/apt.conf.d/50unattended-upgrades` mengaktifkan instalasi otomatis security updates.

---

## 7. User Non-Root untuk Menjalankan BackupVault
```bash
# Buat service user khusus tanpa password login:
sudo useradd -r -s /usr/sbin/nologin -d /var/backupvault backupvault
sudo usermod -aG backupvault $USER
```
Semua file server, container, dan storage berjalan sebagai user `backupvault` (UID 1001), mencegah eskalasi privilege jika terjadi kerentanan aplikasi.
