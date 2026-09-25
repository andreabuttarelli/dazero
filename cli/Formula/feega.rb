# typed: false
# frozen_string_literal: true

# Homebrew formula for the dazero CLI (prebuilt binaries from GitHub Releases).
#
# Install (dedicated tap, kept in sync by the cli-v* release workflow):
#   brew tap andreabuttarelli/tap https://github.com/andreabuttarelli/homebrew-tap
#   brew install dazero
#
# SHA256 placeholders below are filled by .github/workflows/cli-release.yml on each cli-v* tag.

class Dazero < Formula
  desc "Command-line client for dazero — social media AI autopilot"
  homepage "https://dazero.co"
  version "0.1.0"
  license "Apache-2.0"

  livecheck do
    url "https://github.com/andreabuttarelli/dazero/releases/latest"
    regex(%r{/tag/cli-v?(\d+(?:\.\d+)+)"}i)
    strategy :github_latest
  end

  on_macos do
    on_arm do
      url "https://github.com/andreabuttarelli/dazero/releases/download/cli-v#{version}/dazero-macos-arm64.tar.gz"
      sha256 "REPLACE_SHA256_MACOS_ARM64"
    end
    on_intel do
      url "https://github.com/andreabuttarelli/dazero/releases/download/cli-v#{version}/dazero-macos-x64.tar.gz"
      sha256 "REPLACE_SHA256_MACOS_X64"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/andreabuttarelli/dazero/releases/download/cli-v#{version}/dazero-linux-arm64.tar.gz"
      sha256 "REPLACE_SHA256_LINUX_ARM64"
    end
    on_intel do
      url "https://github.com/andreabuttarelli/dazero/releases/download/cli-v#{version}/dazero-linux-x64.tar.gz"
      sha256 "REPLACE_SHA256_LINUX_X64"
    end
  end

  def install
    binary = Dir["dazero-*"].first
    odie "dazero binary missing from archive" if binary.nil?
    bin.install binary => "dazero"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/dazero --version")
  end
end
