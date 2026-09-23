Pod::Spec.new do |s|
  s.name           = 'RecallNative'
  s.version        = '0.1.0'
  s.summary        = 'On-device OCR, PDF text and QR decoding for RecallLater'
  s.description    = 'Wraps Apple Vision and PDFKit so shared items are processed without leaving the device.'
  s.author         = 'Saurabh Maurya'
  s.homepage       = 'https://github.com/srbmaury/RecallLater'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Vision', 'PDFKit'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
