// Cut the main subject out of a photo (transparent background), using Apple's Vision "lift subject".
// usage: swift tools/cutout.swift input.jpg output.png
import Foundation
import Vision
import CoreImage
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count == 3 else { print("usage: cutout in.jpg out.png"); exit(1) }
let inURL = URL(fileURLWithPath: args[1]), outURL = URL(fileURLWithPath: args[2])

guard let src = CGImageSourceCreateWithURL(inURL as CFURL, nil),
      let cg = CGImageSourceCreateImageAtIndex(src, 0, nil) else { print("can't read image"); exit(1) }

let request = VNGenerateForegroundInstanceMaskRequest()
let handler = VNImageRequestHandler(cgImage: cg, options: [:])
do {
  try handler.perform([request])
  guard let result = request.results?.first else { print("no subject found"); exit(2) }
  print("instances:", result.allInstances.count)
  let buf = try result.generateMaskedImage(ofInstances: result.allInstances, from: handler, croppedToInstancesExtent: true)
  let ci = CIImage(cvPixelBuffer: buf)
  let ctx = CIContext()
  guard let out = ctx.createCGImage(ci, from: ci.extent),
        let dest = CGImageDestinationCreateWithURL(outURL as CFURL, UTType.png.identifier as CFString, 1, nil) else { exit(3) }
  CGImageDestinationAddImage(dest, out, nil)
  CGImageDestinationFinalize(dest)
  print("saved", Int(ci.extent.width), "x", Int(ci.extent.height))
} catch { print("error:", error); exit(4) }
