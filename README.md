# MIDItap - set tap tempo via MIDI

This project contains an electron-app for setting a tap by emulating consecutive tempo taps for audio applications such as tap delays etc.  
The value can be set via a single MIDI pitchbend command (or any other command), resulting in a set of ```config.taps``` individual tap events via MIDI ```noteOn``` signals.

This allows for setting a pre-programmed delay tempo from a cue system (e.g. QLab) to plugin hosts that only allow for live tap signals (e.g. Waves SuperRack).

## Quickstart
The default configuration listens for ```pitchbend``` messages on the input MIDI interface, and sends 5 consecutive ```noteOn``` messages on MIDI note 60 (C3). 
The default input and output channel is 1.

Beware that the timing becomes unstable on some systems if the application is minimized, due to energy saving behavior resulting in infrequent execution of timed events.
