# typed: false
# frozen_string_literal: true

# Homebrew formula for the feega CLI (prebuilt binaries from GitHub Releases).
#
# Install (dedicated tap, kept in sync by the cli-v* release workflow):
#   brew tap andreabuttarelli/tap https://github.com/andreabuttarelli/homebrew-tap
#   brew install feega
#
# SHA256 placeholders below are filled by .github/workflows/cli-release.yml on each cli-v* tag.

class Feega < Formula
  desc "Command-line client for feega — social media AI autopilot"
  homepage "https://feega.app"
  version "0.1.0"
  license "Apache-2.0"

  livecheck do
    url "https://github.com/andreabuttarelli/dazero/releases/latest"
    regex(%r{/tag/cli-v?(\d+(?:\.\d+)+)"}i)
    strategy :github_latest
  end

  on_macos do
    on_arm do
      url "https://github.com/andreabuttarelli/dazero/releases/download/cli-v#{version}/feega-macos-arm64.tar.gz"
      sha256 "REPLACE_SHA256_MACOS_ARM64"
    end
    on_intel do
      url "https://github.com/andreabuttarelli/dazero/releases/download/cli-v#{version}/feega-macos-x64.tar.gz"
      sha256 "REPLACE_SHA256_MACOS_X64"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/andreabuttarelli/dazero/releases/download/cli-v#{version}/feega-linux-arm64.tar.gz"
      sha256 "REPLACE_SHA256_LINUX_ARM64"
    end
    on_intel do
      url "https://github.com/andreabuttarelli/dazero/releases/download/cli-v#{version}/feega-linux-x64.tar.gz"
      sha256 "REPLACE_SHA256_LINUX_X64"
    end
  end

  def install
    binary = Dir["feega-*"].first
    odie "feega binary missing from archive" if binary.nil?
    bin.install binary => "feega"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/feega --version")
  end
end
