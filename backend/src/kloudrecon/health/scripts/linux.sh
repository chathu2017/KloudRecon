#!/usr/bin/env bash
# KloudRecon server health check for Linux: __OS_LABEL__
# Server: __SERVER_NAME__
#
# READ-ONLY. This script only reads information; it changes nothing on the server and sends
# nothing anywhere. It does not read passwords, key files, environment variables or command lines.
#
# How to run
#   1. Save this script on the server as kloudrecon-health.sh
#   2. Run it as root so logs and patch information are complete:
#          sudo bash kloudrecon-health.sh > kloudrecon-health.json
#   3. Paste the content of kloudrecon-health.json into KloudRecon:
#      Server health > this server > Paste the output.

export LC_ALL=C LANG=C
PATH=$PATH:/usr/sbin:/sbin:/usr/local/sbin
PKG="__PACKAGES__"   # apt | rpm | zypper | auto
if [ "$PKG" = "auto" ]; then
  if command -v apt-get >/dev/null 2>&1; then PKG=apt
  elif command -v zypper >/dev/null 2>&1; then PKG=zypper
  elif command -v dnf >/dev/null 2>&1 || command -v yum >/dev/null 2>&1; then PKG=rpm
  else PKG=none; fi
fi
RPM=$(command -v dnf 2>/dev/null || command -v yum 2>/dev/null)
# package manager queries may refresh repository metadata: never wait longer than this
T=""; command -v timeout >/dev/null 2>&1 && T="timeout 180"

# text -> JSON string content
esc() {
  awk 'BEGIN { ORS = "" }
       { gsub(/\\/, "\\\\"); gsub(/"/, "\\\""); gsub(/\t/, "\\t"); gsub(/\r/, "");
         gsub(/[\001-\010\013\014\016-\037]/, "");
         if (NR > 1) printf "\\n"; print }'
}
FIRST=1
sec() {  # sec <name> <function>: one section = the raw output of one function, at most 60 kB
  name=$1; shift
  out=$("$@" 2>/dev/null | head -c 60000)
  if [ "$FIRST" = 1 ]; then FIRST=0; else printf ',\n'; fi
  printf '    "%s": "%s"' "$name" "$(printf '%s' "$out" | esc)"
}

s_os_release() { cat /etc/os-release; }
s_hostname()   { hostname -f 2>/dev/null || hostname; }
s_uname()      { uname -srm; }
s_uptime()     { cat /proc/uptime; }
s_cpu()        { echo "cores $(nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo)"; grep -m1 'model name' /proc/cpuinfo; echo "loadavg $(cat /proc/loadavg)"; }
s_meminfo()    { grep -E '^(MemTotal|MemFree|MemAvailable|Buffers|Cached|SwapTotal|SwapFree):' /proc/meminfo; }
s_df()         { df -PT -x tmpfs -x devtmpfs -x squashfs -x overlay -x efivarfs 2>/dev/null; }
s_inodes()     { df -Pi -x tmpfs -x devtmpfs -x squashfs -x overlay -x efivarfs 2>/dev/null; }
s_virt()       { systemd-detect-virt 2>/dev/null || echo unknown; }
s_failed()     { systemctl --failed --no-legend --plain 2>/dev/null | awk '{print $1, $4}' | head -40; }
s_journal()    { journalctl -p 3 --since '7 days ago' --no-pager -o short-iso 2>/dev/null | tail -n 150; }
s_counts()     { for p in 2 3 4; do printf '%s %s\n' "$p" "$(journalctl -p "$p..$p" --since '7 days ago' --no-pager -q 2>/dev/null | wc -l)"; done; }
s_kernel_log() { dmesg --level=err,crit,alert,emerg 2>/dev/null | tail -n 40; }
s_oom()        { journalctl -k --since '30 days ago' --no-pager 2>/dev/null | grep -ci 'out of memory'; }
s_reboot() {
  if [ -f /var/run/reboot-required ]; then echo yes; head -20 /var/run/reboot-required.pkgs 2>/dev/null
  elif command -v needs-restarting >/dev/null 2>&1; then needs-restarting -r >/dev/null 2>&1 && echo no || echo yes
  elif [ "$PKG" = zypper ]; then $T zypper -n needs-rebooting >/dev/null 2>&1 && echo no || echo yes
  else echo unknown; fi
}
s_kernels()    { echo "running $(uname -r)"; ls -1 /boot/vmlinuz-* 2>/dev/null | sed 's#.*/vmlinuz-#installed #' | tail -6; }
s_sshd() {
  sshd -T 2>/dev/null | grep -Ei '^(permitrootlogin|passwordauthentication|permitemptypasswords|port|x11forwarding|maxauthtries) ' && return
  grep -Ehi '^[[:space:]]*(permitrootlogin|passwordauthentication|permitemptypasswords|port)[[:space:]]' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null
}
s_listening()  { ss -tulnH 2>/dev/null | awk '{print $1, $5}' | sort -u | head -80; }
s_firewall() {
  if command -v ufw >/dev/null 2>&1; then echo "ufw $(ufw status 2>/dev/null | head -1)"; fi
  if command -v firewall-cmd >/dev/null 2>&1; then echo "firewalld $(firewall-cmd --state 2>&1)"; fi
  if command -v nft >/dev/null 2>&1; then echo "nft_rules $(nft list ruleset 2>/dev/null | grep -c .)"; fi
  if command -v iptables >/dev/null 2>&1; then echo "iptables_rules $(iptables -S 2>/dev/null | grep -vc '^-P')"; fi
}
s_mac()        { if command -v getenforce >/dev/null 2>&1; then echo "selinux $(getenforce)"; fi; if command -v aa-status >/dev/null 2>&1; then aa-status --enabled 2>/dev/null && echo 'apparmor enabled' || echo 'apparmor disabled'; fi; }
s_time()       { timedatectl show -p NTPSynchronized -p Timezone 2>/dev/null || timedatectl 2>/dev/null | grep -Ei 'synchronized|time zone'; }
s_accounts() {
  awk -F: '$3 == 0 { print "uid0 " $1 }' /etc/passwd
  echo "admins $(getent group sudo wheel 2>/dev/null | cut -d: -f4 | tr '\n' ',')"
  echo "empty_passwords $(awk -F: '$2 == "" { c++ } END { print c + 0 }' /etc/shadow 2>/dev/null || echo unknown)"
  echo "login_users $(awk -F: '$7 !~ /(nologin|false)$/ { c++ } END { print c + 0 }' /etc/passwd)"
}
s_top()        { ps -eo comm,pcpu,pmem --sort=-pcpu 2>/dev/null | head -8; }
s_patches() {
  case "$PKG" in
    apt)    $T apt list --upgradable 2>/dev/null | grep -v '^Listing' | head -400 ;;
    rpm)    $T "$RPM" -q updateinfo list --updates 2>/dev/null | head -400 ;;
    zypper) $T zypper -n -q list-patches 2>/dev/null | head -300 ;;
  esac
}
s_updates_count() {
  case "$PKG" in
    apt)    $T apt list --upgradable 2>/dev/null | grep -vc '^Listing' ;;
    rpm)    $T "$RPM" -q check-update 2>/dev/null | grep -Ec '^[A-Za-z0-9_.+-]+\.[a-z0-9_]+[[:space:]]' ;;
    zypper) $T zypper -n -q list-updates 2>/dev/null | grep -c '^v ' ;;
  esac
}
s_cves() {
  case "$PKG" in
    rpm)    $T "$RPM" -q updateinfo list --updates cves 2>/dev/null | head -300 ;;
    zypper) $T zypper -n -q list-patches --cve 2>/dev/null | head -300 ;;
  esac
}
s_patch_state() {
  echo "manager $PKG"
  case "$PKG" in
    apt)
      echo "lists_updated $(stat -c %Y /var/lib/apt/periodic/update-success-stamp 2>/dev/null || stat -c %Y /var/lib/apt/lists 2>/dev/null)"
      echo "last_install $(grep -h '^Start-Date' /var/log/apt/history.log 2>/dev/null | tail -1 | cut -d' ' -f2)"
      echo "auto_updates $(grep -hs 'Unattended-Upgrade' /etc/apt/apt.conf.d/*auto-upgrades* | grep -c '"1"')" ;;
    rpm)
      echo "last_install $(rpm -qa --last 2>/dev/null | head -1 | sed 's/^[^ ]* *//')"
      echo "auto_updates $(systemctl is-enabled dnf-automatic.timer yum-cron 2>/dev/null | grep -c enabled)" ;;
    zypper)
      echo "last_install $(rpm -qa --last 2>/dev/null | head -1 | sed 's/^[^ ]* *//')"
      echo "auto_updates 0" ;;
  esac
  echo "packages $( (dpkg-query -f '.\n' -W 2>/dev/null || rpm -qa 2>/dev/null) | wc -l)"
}

printf '{\n  "schema": "kloudrecon.linux.v1",\n  "server": "__SERVER_NAME__",\n'
printf '  "collected_at": "%s",\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf '  "root": %s,\n' "$([ "$(id -u)" = 0 ] && echo true || echo false)"
printf '  "sections": {\n'
sec os_release s_os_release
sec hostname s_hostname
sec uname s_uname
sec uptime s_uptime
sec cpu s_cpu
sec meminfo s_meminfo
sec df s_df
sec inodes s_inodes
sec virtualization s_virt
sec failed_units s_failed
sec journal_errors s_journal
sec journal_counts s_counts
sec kernel_log s_kernel_log
sec oom_kills s_oom
sec reboot_required s_reboot
sec kernels s_kernels
sec sshd s_sshd
sec listening s_listening
sec firewall s_firewall
sec mac s_mac
sec time s_time
sec accounts s_accounts
sec top_processes s_top
sec patch_state s_patch_state
sec patches s_patches
sec updates_count s_updates_count
sec cves s_cves
printf '\n  }\n}\n'
