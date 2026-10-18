# RF coil design

Engineering Studio wraps the VUIIS low-field solenoid optimizer in
`RFcoilbuilder/`. PuLP with CBC stays in `RFcoilbuilder/.venv`.

The worker places integer turns in uniformly spaced grooves to match a uniform
on-axis B1 target. The ILP is the VUIIS formulation; SciPy HiGHS solves it when
CBC is not installed. It reports inductance, Q, and tuning capacitance for AWG 20
at the requested frequency. Displayed loops are closed circular turns on a
cylinder (bore along Z). Save STL exports those turns as a millimetre tube solid.

This is 3D linear magnetostatics of circular loops, not a birdcage, TEM, or
loaded-cavity solver.
