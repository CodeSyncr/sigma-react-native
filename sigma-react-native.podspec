require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "sigma-react-native"
  s.module_name  = "SigmaReactNative"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = { :type => "Commercial", :file => "LICENSE" }
  s.authors      = package["author"]

  s.platforms    = { :ios => "16.0" }
  s.source       = { :git => "https://github.com/CodeSyncr/sigma-react-native.git", :tag => s.version.to_s }
  s.swift_version = "5.10"

  s.source_files = "ios/**/*.{h,m,mm,swift}"
  s.pod_target_xcconfig = { "DEFINES_MODULE" => "YES" }

  # The native iOS SDK (github.com/CodeSyncr/sigma-ios, NimbusSigma.podspec).
  s.dependency "NimbusSigma", "~> #{package["sigma"]["iosSdkVersion"]}"

  if respond_to?(:install_modules_dependencies, true)
    install_modules_dependencies(s)
  else
    s.dependency "React-Core"
  end
end
